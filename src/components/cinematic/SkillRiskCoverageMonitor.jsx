/**
 * SkillRiskCoverageMonitor — F508
 * "JARVIS, skill risk / risk skill / skrsk / skill coverage risk / what skills cover risks / risk skill coverage"
 * Cross-references /v1/aip/skill + /entities/RiskSignal.
 * Finds COVERED risks (≥1 skill keyword-matches the signal) vs UNCOVERED.
 * Coverage % tile; ALL/COVERED/UNCOVERED filter tabs + search; click-to-expand matched skills.
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
const BTN_LEFT = 29_840;
const Z_INDEX  = 93;

const SKRSK_RE =
  /\bskrsk\b|\bskill.?risk\b|\brisk.?skill\b|\bskill.?coverage.?risk\b|\bwhat.?skills?.?cover\b|\brisk.?skill.?coverage\b|\bskill.?gap.?risk\b|\buncovered.?risk.?skill\b/i;

export function isSkrskQuery(text) {
  return SKRSK_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

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
    id:     s.id || `sk-${i}`,
    name:   s.name || s.skill_name || s.title || `Skill ${i + 1}`,
    domain: s.domain || s.category || s.area || "",
    score:  s.score ?? s.rating ?? s.level ?? null,
    description: s.description || s.summary || "",
    tags:   Array.isArray(s.tags) ? s.tags.join(" ") : String(s.tags || ""),
  }));
}

function normaliseSignals(data) {
  if (!data) return [];
  const raw =
    data.signals || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:          s.id || `sig-${i}`,
    name:        s.name || s.title || s.signal_name || `Signal ${i + 1}`,
    severity:    (s.severity || s.level || "MEDIUM").toUpperCase(),
    description: s.description || s.summary || "",
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : String(s.tags || ""),
    status:      (s.status || "ACTIVE").toUpperCase(),
  }));
}

function crossRef(signals, skills) {
  return signals.map((sig) => {
    const haystack = `${sig.name} ${sig.description} ${sig.tags}`;
    const matches = skills
      .map((sk) => ({
        sk,
        hits: overlap(haystack, `${sk.name} ${sk.domain} ${sk.description} ${sk.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...sig,
      covered: matches.length > 0,
      matches: matches.map(({ sk, hits }) => ({ ...sk, hits })),
    };
  });
}

// ─── buildSkrskScript (for JarvisBrain) ──────────────────────────────────────

export async function buildSkrskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [skillRes, sigRes] = await Promise.all([
      fetch(`${base}/v1/aip/skill`,       { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
    ]);
    const skillData = skillRes.ok ? await skillRes.json() : {};
    const sigData   = sigRes.ok  ? await sigRes.json()  : {};

    const skills  = normaliseSkills(skillData);
    const signals = normaliseSignals(sigData);
    const crossed = crossRef(signals, skills);

    const total     = crossed.length;
    const covered   = crossed.filter((s) => s.covered).length;
    const uncovered = total - covered;
    const coverage  = total > 0 ? Math.round((covered / total) * 100) : 0;
    const topUncov  = crossed
      .filter((s) => !s.covered && s.severity === "CRITICAL")
      .slice(0, 2)
      .map((s) => s.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} active risk signals have skill coverage. ` +
      `${covered} COVERED, ${uncovered} UNCOVERED.` +
      (topUncov ? ` Critical gaps: ${topUncov}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Skill × Risk Coverage: ${brief} Provide a 2-sentence operational assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Skill × Risk Coverage Monitor unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const SEV_COLOR = { CRITICAL: RED, HIGH: AMB, MEDIUM: CY, LOW: DIM, INFO: DIM };

export default function SkillRiskCoverageMonitor() {
  const [open, setOpen]         = useState(false);
  const [skills, setSkills]     = useState([]);
  const [signals, setSignals]   = useState([]);
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
      const [skillRes, sigRes] = await Promise.all([
        fetch(`${base}/v1/aip/skill`,       { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      const skillData = skillRes.ok ? await skillRes.json() : {};
      const sigData   = sigRes.ok  ? await sigRes.json()  : {};

      const sks  = normaliseSkills(skillData);
      const sigs = normaliseSignals(sigData);
      setSkills(sks);
      setSignals(sigs);
      setCrossed(crossRef(sigs, sks));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:skrsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:skrsk-toggle", onToggle);
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
      const covered  = crossed.filter((s) => s.covered).length;
      const uncovered = total - covered;
      const coverage = total > 0 ? Math.round((covered / total) * 100) : 0;
      const prompt   = `Skill × Risk Coverage: ${coverage}% (${covered}/${total} covered, ${uncovered} uncovered). Assess in 2 sentences.`;
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
    if (tab === "COVERED"   && !s.covered) return false;
    if (tab === "UNCOVERED" &&  s.covered) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !(s.description || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const total      = crossed.length;
  const nCovered   = crossed.filter((s) => s.covered).length;
  const nUncovered = total - nCovered;
  const coverage   = total > 0 ? Math.round((nCovered / total) * 100) : 0;
  const badgeCount = nUncovered;

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
        title="Skill × Risk Coverage Monitor"
      >
        ◈ SKRSK
        {badgeCount > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>
            {badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>SKILL × RISK COVERAGE</span>
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

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { label: "COVERAGE",   value: `${coverage}%`,  color: coverage > 60 ? GRN : coverage > 30 ? AMB : RED },
              { label: "COVERED",    value: nCovered,         color: GRN },
              { label: "UNCOVERED",  value: nUncovered,       color: AMB },
              { label: "SKILLS",     value: skills.length,    color: CY  },
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

          {/* Assess */}
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

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "COVERED", "UNCOVERED"].map((t) => (
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

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search risk signals…"
            style={{
              width: "100%", background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              color: CY, padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace",
            }}
          />

          {/* Signal rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No signals match.</div>
          ) : (
            visible.map((sig) => (
              <div key={sig.id}>
                <div
                  onClick={() => setExpanded(expanded === sig.id ? null : sig.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 6px", marginBottom: 3, cursor: "pointer",
                    borderRadius: 3, background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${sig.covered ? GRN + "44" : DIM + "22"}`,
                  }}
                >
                  <span style={{ fontSize: 9, color: SEV_COLOR[sig.severity] || DIM, minWidth: 52 }}>
                    {sig.severity}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, color: sig.covered ? GRN : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sig.name}
                  </span>
                  {sig.covered ? (
                    <span style={{ fontSize: 8, color: GRN }}>⬡ {sig.matches.length} sk</span>
                  ) : (
                    <span style={{ fontSize: 8, color: AMB }}>UNCOVERED</span>
                  )}
                </div>

                {expanded === sig.id && sig.covered && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {sig.description && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>{sig.description}</div>
                    )}
                    {sig.matches.map((sk) => (
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

                {expanded === sig.id && !sig.covered && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    No skills currently cover this signal.
                    {sig.description && <div style={{ marginTop: 2 }}>{sig.description}</div>}
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
