/**
 * SkillScenarioCoverageMonitor — F614
 * "JARVIS, skill scenario / scenario skill / skscn / skill scenario coverage / which scenarios have skills / scenario skill gap"
 * Cross-references /v1/aip/skill + /v1/scenario/list.
 * Finds BACKED scenarios (≥1 skill keyword-matches) vs UNBACKED.
 * Coverage % tile; ALL/BACKED/UNBACKED filter tabs + search; click-to-expand matched skills.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4466";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 93_340;
const Z_INDEX  = 167;

const SKSCN_RE =
  /\bskscn\b|\bskill.?scenario\b|\bscenario.?skill\b|\bskill.?scenario.?coverage\b|\bwhich.?scenarios?.?have.?skills?\b|\bscenario.?skill.?gap\b|\bskill.?backed.?scenario\b|\bunbacked.?scenario\b/i;

export function isSkscnQuery(text) {
  return SKSCN_RE.test(text || "");
}

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseSkills(data) {
  if (!data) return [];
  const raw =
    data.skills || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:          s.id || `sk-${i}`,
    name:        s.name || s.skill_name || s.title || `Skill ${i + 1}`,
    domain:      s.domain || s.category || s.area || "",
    score:       s.score ?? s.rating ?? s.level ?? null,
    description: s.description || s.summary || "",
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : String(s.tags || ""),
  }));
}

function normaliseScenarios(data) {
  if (!data) return [];
  const raw =
    data.scenarios || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:          s.id || `scn-${i}`,
    name:        s.name || s.title || s.scenario_name || `Scenario ${i + 1}`,
    kind:        (s.kind || s.type || s.category || "SCENARIO").toUpperCase(),
    description: s.description || s.summary || "",
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : String(s.tags || ""),
    status:      (s.status || "ACTIVE").toUpperCase(),
  }));
}

function crossRef(scenarios, skills) {
  return scenarios.map((scn) => {
    const haystack = `${scn.name} ${scn.description} ${scn.tags}`;
    const matches = skills
      .map((sk) => ({
        sk,
        hits: overlap(haystack, `${sk.name} ${sk.domain} ${sk.description} ${sk.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...scn,
      backed: matches.length > 0,
      matches: matches.map(({ sk, hits }) => ({ ...sk, hits })),
    };
  });
}

export async function buildSkscnScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [skillRes, scnRes] = await Promise.all([
      fetch(`${base}/v1/aip/skill`,      { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,  { headers: hdr }),
    ]);
    const skillData = skillRes.ok ? await skillRes.json() : {};
    const scnData   = scnRes.ok  ? await scnRes.json()  : {};

    const skills    = normaliseSkills(skillData);
    const scenarios = normaliseScenarios(scnData);
    const crossed   = crossRef(scenarios, skills);

    const total    = crossed.length;
    const backed   = crossed.filter((s) => s.backed).length;
    const unbacked = total - backed;
    const coverage = total > 0 ? Math.round((backed / total) * 100) : 0;
    const topGaps  = crossed
      .filter((s) => !s.backed)
      .slice(0, 2)
      .map((s) => s.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} scenarios are skill-backed. ` +
      `${backed} BACKED, ${unbacked} UNBACKED.` +
      (topGaps ? ` Top gaps: ${topGaps}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Skill × Scenario Coverage: ${brief} Provide a 2-sentence operational assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Skill × Scenario Coverage Monitor unavailable: ${err.message}`;
  }
}

const KIND_COLOR = {
  THREAT: RED, RISK: AMB, INTEL: CY, OPS: "#A0C0FF",
  SCENARIO: DIM, SIMULATION: GRN,
};

export default function SkillScenarioCoverageMonitor() {
  const [open, setOpen]         = useState(false);
  const [skills, setSkills]     = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [crossed, setCrossed]   = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [query, setQuery]       = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]       = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [skillRes, scnRes] = await Promise.all([
        fetch(`${base}/v1/aip/skill`,     { headers: hdr }),
        fetch(`${base}/v1/scenario/list`, { headers: hdr }),
      ]);
      const skillData = skillRes.ok ? await skillRes.json() : {};
      const scnData   = scnRes.ok  ? await scnRes.json()  : {};

      const sks  = normaliseSkills(skillData);
      const scns = normaliseScenarios(scnData);
      setSkills(sks);
      setScenarios(scns);
      setCrossed(crossRef(scns, sks));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:skscn-toggle", onToggle);
    return () => window.removeEventListener("jarvis:skscn-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setBrief("");
    try {
      const base     = apiBase();
      const hdr      = { Authorization: `Bearer ${API_KEY}` };
      const total    = crossed.length;
      const backed   = crossed.filter((s) => s.backed).length;
      const unbacked = total - backed;
      const coverage = total > 0 ? Math.round((backed / total) * 100) : 0;
      const prompt   = `Skill × Scenario Coverage: ${coverage}% (${backed}/${total} backed, ${unbacked} unbacked). Assess in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d    = res.ok ? await res.json() : {};
      const text = d.response || d.message || d.reply || "Assessment complete.";
      setBrief(text);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssess(false);
    }
  }, [crossed]);

  const visible = crossed.filter((s) => {
    if (tab === "BACKED"   && !s.backed) return false;
    if (tab === "UNBACKED" &&  s.backed) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !(s.description || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const total      = crossed.length;
  const nBacked    = crossed.filter((s) => s.backed).length;
  const nUnbacked  = total - nBacked;
  const coverage   = total > 0 ? Math.round((nBacked / total) * 100) : 0;
  const badgeCount = nUnbacked;

  const btnStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    background: "rgba(0,0,0,0.85)",
    border: `1px solid ${CY}`,
    color: CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "2px 7px",
    cursor: "pointer",
    borderRadius: 3,
    userSelect: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const panelStyle = {
    position: "fixed",
    right: 18,
    bottom: 54,
    width: 460,
    maxHeight: "78vh",
    overflowY: "auto",
    background: "rgba(0,6,18,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 8,
    padding: 16,
    zIndex: 9999,
    fontFamily: "monospace",
    color: CY,
    boxSizing: "border-box",
  };

  return (
    <>
      <button
        style={btnStyle}
        onClick={() => setOpen((v) => { if (!v) load(); return !v; })}
        title="Skill × Scenario Coverage Monitor"
      >
        ◈ SKSCN
        {badgeCount > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>
            {badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>SKILL × SCENARIO COVERAGE</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}55`, color: CY, cursor: "pointer", padding: "2px 8px", borderRadius: 3, fontSize: 10 }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { label: "COVERAGE",   value: `${coverage}%`, color: coverage > 60 ? GRN : coverage > 30 ? AMB : RED },
              { label: "BACKED",     value: nBacked,         color: GRN },
              { label: "UNBACKED",   value: nUnbacked,       color: AMB },
              { label: "SKILLS",     value: skills.length,   color: CY  },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1, background: "rgba(41,231,255,0.05)", border: `1px solid ${color}33`,
                  borderRadius: 4, padding: "6px 8px", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: "bold", color }}>{value}</div>
                <div style={{ fontSize: 8, color: DIM, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 10 }}>
            <button
              onClick={assess}
              disabled={assessing || crossed.length === 0}
              style={{
                background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY, cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px", borderRadius: 3, fontSize: 10, fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, fontSize: 10, color: "#cde", lineHeight: 1.5, padding: "6px 8px", background: "rgba(41,231,255,0.05)", borderRadius: 3 }}>
                {brief}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "BACKED", "UNBACKED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer", padding: "2px 10px", borderRadius: 3,
                  fontSize: 10, fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search scenarios…"
            style={{
              width: "100%", background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              color: CY, padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace",
            }}
          />

          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No scenarios match.</div>
          ) : (
            visible.map((scn) => (
              <div key={scn.id}>
                <div
                  onClick={() => setExpanded(expanded === scn.id ? null : scn.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 6px", marginBottom: 3, cursor: "pointer",
                    borderRadius: 3, background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${scn.backed ? GRN + "44" : DIM + "22"}`,
                  }}
                >
                  <span style={{ fontSize: 9, color: KIND_COLOR[scn.kind] || DIM, minWidth: 56 }}>
                    {scn.kind}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, color: scn.backed ? GRN : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {scn.name}
                  </span>
                  {scn.backed ? (
                    <span style={{ fontSize: 8, color: GRN }}>⬡ {scn.matches.length} sk</span>
                  ) : (
                    <span style={{ fontSize: 8, color: AMB }}>UNBACKED</span>
                  )}
                </div>

                {expanded === scn.id && scn.backed && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {scn.description && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>{scn.description}</div>
                    )}
                    {scn.matches.map((sk) => (
                      <div
                        key={sk.id}
                        style={{
                          padding: "3px 6px", marginBottom: 2, borderRadius: 2,
                          background: "rgba(0,229,160,0.05)", border: `1px solid ${GRN}33`,
                          fontSize: 9,
                        }}
                      >
                        <span style={{ color: GRN }}>{sk.name}</span>
                        {sk.domain && <span style={{ color: DIM, marginLeft: 6 }}>[{sk.domain}]</span>}
                        {sk.score !== null && <span style={{ color: CY, marginLeft: 6 }}>score:{sk.score}</span>}
                        <span style={{ color: DIM, marginLeft: 6 }}>hits:{sk.hits}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === scn.id && !scn.backed && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    No skills currently back this scenario.
                    {scn.description && <div style={{ marginTop: 2 }}>{scn.description}</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
