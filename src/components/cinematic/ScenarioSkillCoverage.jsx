/**
 * F67 — Scenario-Skill Coverage Analyzer
 *
 * Parallel-fetches /v1/scenario/list + /v1/aip/skill, then keyword-correlates
 * each scenario (name / objective / description) against every skill (name /
 * description / category) to surface:
 *   EQUIPPED   — scenarios that have at least one skill backing them
 *   UNEQUIPPED — scenarios with zero matching skill (readiness gap)
 *
 * Stat tiles: scenarios / skills / equipped / unequipped.
 * Filter tabs: ALL | EQUIPPED | UNEQUIPPED.
 * Text search over scenario name / status / type.
 * Expand any scenario → matched skills with relevance score + category.
 * ▶ ASSESS: /v1/jarvis/agent/chat 2-sentence scenario readiness brief + TTS.
 *
 * Toggle:  ◈ SSCOV  at bottom:8 left:15500, zIndex 69.
 * Event:   jarvis:sscov-toggle
 * Voice:   "scenario skill coverage / scenario readiness / scenario equipment /
 *           which scenarios have skills / sscov"
 * Refresh: 5 min auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 15500;
const POLL_MS  = 300_000; // 5 min

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ──────────────────────────────────────────────────

const SSCOV_RE =
  /\b(scenario[\s-]*skill\s+cov(?:erage)?|scenario\s+readiness|scenario\s+equipment|which\s+scenarios?\s+(have|lack|need)\s+skills?|skill[\s-]*backed\s+scenarios?|sscov)\b/i;

export function isScenSkillCovQuery(q) { return SSCOV_RE.test(q); }

export async function buildScenSkillCovScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [scRes, skRes] = await Promise.all([
      fetch(`${base}/v1/scenario/list`, { headers: hdr }),
      fetch(`${base}/v1/aip/skill`,     { headers: hdr }),
    ]);
    const scRaw = await scRes.json();
    const skRaw = await skRes.json();
    const scenarios = normaliseScenarios(scRaw);
    const skills    = normaliseSkills(skRaw);

    const equipped   = scenarios.filter((s) => skills.some((sk) => relevance(s, sk) > 0)).length;
    const unequipped = scenarios.length - equipped;
    const pct        = scenarios.length ? Math.round((equipped / scenarios.length) * 100) : 0;

    const worstGap = scenarios.find((s) =>
      !skills.some((sk) => relevance(s, sk) > 0)
    );

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS scenario-skill coverage analysis: ${scenarios.length} scenarios mapped against ` +
          `${skills.length} operational skills — ${equipped} scenarios have skill backing (${pct}%), ` +
          `${unequipped} scenarios are unequipped (no matching skill in the catalog). ` +
          `${worstGap ? `First unequipped scenario: "${worstGap.name}" (status: ${worstGap.status}). ` : ""}` +
          `Give a 2-sentence scenario operational readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Scenario skill coverage analysis complete, sir.").trim();
  } catch {
    return "Scenario skill coverage panel unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.scenarios)            ? raw.scenarios
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || String(i),
    name:        s.name        || s.title       || s.scenario_name || `Scenario ${i + 1}`,
    description: (s.description || s.objective  || s.summary      || s.details || "").toString().slice(0, 300),
    status:      (s.status      || "unknown").toLowerCase(),
    type:        s.type        || s.scenario_type || "",
  }));
}

function normaliseSkills(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.skills)               ? raw.skills
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || String(i),
    name:        s.name        || s.title       || s.skill_name || `Skill ${i + 1}`,
    description: (s.description || s.summary    || s.detail    || "").toString().slice(0, 300),
    category:    s.category    || s.type        || "",
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(scenario, skill) {
  const sw = keywords(`${scenario.name} ${scenario.description} ${scenario.type}`);
  const kw = keywords(`${skill.name} ${skill.description} ${skill.category}`);
  return sw.filter((w) => kw.some((r) => r.includes(w) || w.includes(r))).length;
}

function buildCorrelatedScenarios(scenarios, skills) {
  return scenarios.map((sc) => {
    const matched = skills
      .map((sk) => ({ ...sk, score: relevance(sc, sk) }))
      .filter((sk) => sk.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sc, skills: matched, equipped: matched.length > 0 };
  });
}

function statusColor(s) {
  if (s === "running")    return "#4ADE80";
  if (s === "pending")    return "#FFD700";
  if (s === "queued")     return "#60A5FA";
  if (s === "failed")     return "#FF3333";
  if (s === "completed")  return "#6B7280";
  return "#9CA3AF";
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "EQUIPPED", "UNEQUIPPED"];

export default function ScenarioSkillCoverage() {
  const [open,      setOpen]      = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [skills,    setSkills]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [scRes, skRes] = await Promise.all([
        fetch(`${base}/v1/scenario/list`, { headers: hdr }),
        fetch(`${base}/v1/aip/skill`,     { headers: hdr }),
      ]);
      const scRaw = await scRes.json();
      const skRaw = await skRes.json();
      setScenarios(normaliseScenarios(scRaw));
      setSkills(normaliseSkills(skRaw));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:sscov-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sscov-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isScenSkillCovQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated  = buildCorrelatedScenarios(scenarios, skills);
  const equipped    = correlated.filter((s) => s.equipped).length;
  const unequipped  = scenarios.length - equipped;

  const q = search.toLowerCase();
  const visible = correlated
    .filter((s) => {
      if (filter === "EQUIPPED")   return s.equipped;
      if (filter === "UNEQUIPPED") return !s.equipped;
      return true;
    })
    .filter((s) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.status.toLowerCase().includes(q) ||
      s.type.toLowerCase().includes(q)
    );

  async function assess() {
    setAssessing(true);
    const text = await buildScenSkillCovScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Scenario-Skill Coverage (◈ SSCOV)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ SSCOV{unequipped > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF8800", color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{unequipped}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 370,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              SCENARIO↔SKILL COVERAGE
            </span>
            <button
              onClick={assess}
              disabled={assessing || scenarios.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || scenarios.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "SCENARIOS",  val: scenarios.length, color: C.blue    },
              { label: "SKILLS",     val: skills.length,    color: C.neon    },
              { label: "EQUIPPED",   val: equipped,         color: "#4ADE80" },
              { label: "UNEQUIPPED", val: unequipped,       color: unequipped > 0 ? "#FF8800" : "#6B7280" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 4px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>
                {t}{t === "UNEQUIPPED" && unequipped > 0 ? ` (${unequipped})` : ""}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search name / status / type…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: "9px", padding: "3px 7px",
                outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && scenarios.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No scenarios match.</div>
            ) : (
              visible.map((sc) => (
                <div key={sc.id} style={{ marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(expanded === sc.id ? null : sc.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                      background: "rgba(0,0,0,0.25)",
                      borderLeft: `3px solid ${sc.equipped ? "#4ADE80" : "#FF8800"}`,
                    }}
                  >
                    <span style={{ color: sc.equipped ? "#4ADE80" : "#FF8800", fontSize: 10, width: 10 }}>
                      {sc.equipped ? "●" : "○"}
                    </span>
                    <span style={{
                      flex: 1, color: S.textHi,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {sc.name}
                    </span>
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${statusColor(sc.status)}22`, color: statusColor(sc.status),
                      border: `1px solid ${statusColor(sc.status)}55`,
                      whiteSpace: "nowrap", textTransform: "uppercase",
                    }}>
                      {sc.status || "?"}
                    </span>
                    <span style={{
                      color: sc.equipped ? "#4ADE80" : "#FF8800",
                      fontSize: "9px", minWidth: 32, textAlign: "right",
                    }}>
                      {sc.equipped ? `${sc.skills.length}S` : "—"}
                    </span>
                    <span style={{ color: S.text, fontSize: 9 }}>
                      {expanded === sc.id ? "▴" : "▾"}
                    </span>
                  </div>

                  {expanded === sc.id && (
                    <div style={{
                      margin: "2px 0 2px 18px",
                      background: "rgba(0,0,0,0.18)", borderRadius: 4,
                      padding: "5px 8px",
                    }}>
                      {sc.type && (
                        <div style={{ color: S.text, fontSize: "8px", marginBottom: 4 }}>
                          type: <span style={{ color: C.blue }}>{sc.type}</span>
                        </div>
                      )}
                      {sc.equipped ? sc.skills.map((sk) => (
                        <div key={sk.id} style={{
                          display: "flex", alignItems: "flex-start", gap: 6,
                          padding: "3px 0", borderBottom: `1px solid ${S.border}33`,
                        }}>
                          <span style={{ color: C.neon, fontSize: 9, marginTop: 1 }}>◦</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              color: S.textHi, fontSize: "9px",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {sk.name}
                            </div>
                            {sk.category && (
                              <div style={{ color: S.text, fontSize: "8px" }}>{sk.category}</div>
                            )}
                          </div>
                          <span style={{ color: C.blue, fontSize: "9px", whiteSpace: "nowrap" }}>
                            rel:{sk.score}
                          </span>
                        </div>
                      )) : (
                        <div style={{ color: "#FF8800", fontSize: "9px", padding: "2px 0" }}>
                          No skills aligned to this scenario — readiness gap detected.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /v1/scenario/list · /v1/aip/skill · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
