/**
 * RiskSignalKnowledgeSkillMitigation — F88.
 *
 * Triple-nexus: /entities/RiskSignal × /knowledge/ × /v1/aip/skill
 *
 * Keyword-correlates each risk signal against:
 *   - knowledge articles (mitigation knowledge backing)
 *   - skills            (capabilities to respond to the threat)
 *
 * Classification per risk signal:
 *   FULLY_MITIGATED — matched ≥1 KB article AND ≥1 skill
 *   KB_ONLY         — has knowledge backing but no skill coverage
 *   SKILL_ONLY      — has skill coverage but no KB article
 *   UNMITIGATED     — no KB or skill match (response blind spot)
 *
 * Stat tiles: SIGNALS / KB ARTICLES / SKILLS / FULLY MITIGATED / UNMITIGATED
 * Filter tabs: ALL / FULLY_MITIGATED / KB_ONLY / SKILL_ONLY / UNMITIGATED
 * List: risk signals sorted by classification (UNMITIGATED first), each expandable.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat-mitigation brief + TTS.
 * 90s auto-refresh.
 *
 * Intent: "rksm" / "risk mitigation" / "unmitigated risk" / "threat mitigation" /
 *         "risk knowledge" / "risk skill" / "mitigation coverage" / "response gap"
 *   → jarvis:rksm-toggle + TTS via buildRksmScript()
 *
 * Toggle: ◈ RKSM at left:968220, bottom:8, zIndex:112.
 * Mounted in App.jsx; wired in JarvisBrain.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const BTN_LEFT   = 968220;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseRiskSignals(raw) {
  return normaliseArray(raw).map((r) => ({
    id: r.id || r.signal_id || String(Math.random()),
    title: r.title || r.name || r.label || "Untitled Signal",
    severity: r.severity || r.level || r.priority || "medium",
    type: r.type || r.kind || r.category || "",
    description: r.description || r.summary || r.details || "",
  }));
}

function normaliseKnowledge(raw) {
  return normaliseArray(raw).map((k) => ({
    id: k.id || k.article_id || String(Math.random()),
    title: k.title || k.name || k.subject || "Untitled Article",
    subject: k.subject || k.category || k.topic || "",
    summary: k.summary || k.content || k.description || "",
  }));
}

function normaliseSkills(raw) {
  return normaliseArray(raw).map((s) => ({
    id: s.id || s.skill_id || String(Math.random()),
    name: s.name || s.title || s.skill_name || "Unnamed Skill",
    category: s.category || s.domain || s.type || "",
    score: s.score || s.proficiency || s.rating || 0,
  }));
}

// ─── overlap scorer ───────────────────────────────────────────────────────────

function tokenise(str) {
  return (str || "").toLowerCase().match(/\b[a-z][a-z0-9_-]{2,}\b/g) || [];
}

function overlap(a, b) {
  const ta = new Set(tokenise(a));
  const tb = tokenise(b);
  return tb.filter((t) => ta.has(t)).length;
}

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const CLS_ORDER = { UNMITIGATED: 0, KB_ONLY: 1, SKILL_ONLY: 2, FULLY_MITIGATED: 3 };

function classify(risk, kbItems, skills) {
  const hay = `${risk.title} ${risk.type} ${risk.description}`;
  const matchedKb = kbItems
    .map((k) => ({ ...k, score: overlap(hay, `${k.title} ${k.subject} ${k.summary}`) }))
    .filter((k) => k.score > 0)
    .sort((a, b) => b.score - a.score);
  const matchedSkills = skills
    .map((s) => ({ ...s, score: overlap(hay, `${s.name} ${s.category}`) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  let cls;
  if (matchedKb.length > 0 && matchedSkills.length > 0) cls = "FULLY_MITIGATED";
  else if (matchedKb.length > 0) cls = "KB_ONLY";
  else if (matchedSkills.length > 0) cls = "SKILL_ONLY";
  else cls = "UNMITIGATED";
  return { ...risk, cls, matchedKb, matchedSkills };
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const RKSM_RE =
  /\brksm\b|risk.{0,10}mitig|unmitigated.{0,10}risk|threat.{0,10}mitig|risk.{0,10}knowledge|risk.{0,10}skill|mitig.{0,10}coverage|response.{0,10}gap/i;

export function isRksmQuery(q) {
  return RKSM_RE.test(q);
}

export async function buildRksmScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [rRaw, kRaw, sRaw] = await Promise.all([
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then((r) => r.json()).catch(() => []),
      fetch(`${base}/knowledge/`, { headers: hdr }).then((r) => r.json()).catch(() => []),
      fetch(`${base}/v1/aip/skill`, { headers: hdr }).then((r) => r.json()).catch(() => []),
    ]);
    const risks  = normaliseRiskSignals(rRaw);
    const kbItems = normaliseKnowledge(kRaw);
    const skills = normaliseSkills(sRaw);
    const unmitigated = risks.filter((r) => {
      const hay = `${r.title} ${r.type} ${r.description}`;
      const mk = kbItems.filter((k) => overlap(hay, `${k.title} ${k.subject} ${k.summary}`) > 0);
      const ms = skills.filter((s) => overlap(hay, `${s.name} ${s.category}`) > 0);
      return mk.length === 0 && ms.length === 0;
    });
    return (
      `Threat Mitigation Coverage: ${risks.length} risk signal${risks.length !== 1 ? "s" : ""} ` +
      `cross-referenced against ${kbItems.length} knowledge article${kbItems.length !== 1 ? "s" : ""} ` +
      `and ${skills.length} skill${skills.length !== 1 ? "s" : ""}. ` +
      `${unmitigated.length} signal${unmitigated.length !== 1 ? "s" : ""} UNMITIGATED — ` +
      `no knowledge backing or skill coverage.` +
      (unmitigated.length > 0
        ? ` Top gap: "${unmitigated[0].title}".`
        : " All signals have mitigation coverage.")
    );
  } catch {
    return "RKSM data unavailable.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "FULLY_MITIGATED", "KB_ONLY", "SKILL_ONLY", "UNMITIGATED"];
const CLASS_COLOR = {
  FULLY_MITIGATED: GREEN,
  KB_ONLY:        AMBER,
  SKILL_ONLY:     CY,
  UNMITIGATED:    RED,
};
const SEV_COLOR = {
  critical: RED,
  high:     "#FF8C42",
  medium:   AMBER,
  low:      GREEN,
};

const PANEL_STYLE = {
  position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 112,
  width: 680, height: 440, background: "rgba(4,8,14,0.96)",
  border: `1px solid ${RED}55`, borderRadius: 12,
  display: "flex", flexDirection: "column",
  fontFamily: "'JetBrains Mono','Courier New',monospace",
  boxShadow: `0 0 40px ${RED}22`,
};
const HDR_STYLE = {
  padding: "8px 14px", borderBottom: `1px solid ${RED}33`,
  display: "flex", alignItems: "center", gap: 10,
};
const TILE_STYLE = (col) => ({
  background: `${col}11`, border: `1px solid ${col}44`,
  borderRadius: 6, padding: "6px 10px", minWidth: 80, textAlign: "center",
});
function BAR(score, max, col) {
  const pct = Math.round((score / (max || 1)) * 100);
  return (
    <div style={{ height: 4, background: "#1a2430", borderRadius: 2, marginTop: 2 }}>
      <div style={{ height: 4, width: `${pct}%`, background: col, borderRadius: 2 }} />
    </div>
  );
}

export default function RiskSignalKnowledgeSkillMitigation() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [risks, setRisks] = useState([]);
  const [kbItems, setKbItems] = useState([]);
  const [skills, setSkills] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [rRaw, kRaw, sRaw] = await Promise.all([
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then((r) => r.json()).catch(() => []),
        fetch(`${base}/knowledge/`, { headers: hdr }).then((r) => r.json()).catch(() => []),
        fetch(`${base}/v1/aip/skill`, { headers: hdr }).then((r) => r.json()).catch(() => []),
      ]);
      setRisks(normaliseRiskSignals(rRaw));
      setKbItems(normaliseKnowledge(kRaw));
      setSkills(normaliseSkills(sRaw));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:rksm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rksm-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (open) {
      timerRef.current = setInterval(load, REFRESH_MS);
      return () => clearInterval(timerRef.current);
    }
  }, [open, load]);

  const assessed = risks.map((r) => classify(r, kbItems, skills));
  assessed.sort((a, b) => {
    const cls = CLS_ORDER[a.cls] - CLS_ORDER[b.cls];
    if (cls !== 0) return cls;
    return (SEV_ORDER[a.severity] || 2) - (SEV_ORDER[b.severity] || 2);
  });

  const counts = assessed.reduce(
    (acc, r) => {
      acc[r.cls] = (acc[r.cls] || 0) + 1;
      return acc;
    },
    { FULLY_MITIGATED: 0, KB_ONLY: 0, SKILL_ONLY: 0, UNMITIGATED: 0 },
  );

  const q = search.toLowerCase();
  const displayed = assessed.filter(
    (r) =>
      (filter === "ALL" || r.cls === filter) &&
      (!q || r.title.toLowerCase().includes(q) || r.type.toLowerCase().includes(q)),
  );

  async function assess(risk) {
    try {
      const base = apiBase();
      const hdr = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const body = JSON.stringify({
        message: `Give a 2-sentence threat-mitigation assessment for risk signal "${risk.title}" (severity: ${risk.severity}). ` +
          `It has ${risk.matchedKb.length} knowledge article${risk.matchedKb.length !== 1 ? "s" : ""} and ` +
          `${risk.matchedSkills.length} skill${risk.matchedSkills.length !== 1 ? "s" : ""} matched. ` +
          `Classification: ${risk.cls}. Is this risk adequately mitigated?`,
      });
      const d = await fetch(`${base}/v1/jarvis/agent/chat`, { method: "POST", headers: hdr, body })
        .then((r) => r.json())
        .catch(() => null);
      const answer = d?.answer || "Assessment unavailable.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {}
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Risk × Knowledge × Skill Mitigation (RKSM)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 112,
          background: "rgba(4,8,14,0.82)", border: `1px solid ${RED}88`,
          color: RED, padding: "3px 8px", fontSize: 10, cursor: "pointer",
          borderRadius: 4, letterSpacing: 1, fontFamily: "inherit",
          animation: "none",
        }}
      >
        ◈ RKSM
      </button>
    );
  }

  return (
    <div style={PANEL_STYLE}>
      {/* header */}
      <div style={HDR_STYLE}>
        <span style={{ color: RED, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ RKSM</span>
        <span style={{ color: "#7a95ab", fontSize: 10 }}>Risk × Knowledge × Skill Mitigation</span>
        {loading && <span style={{ color: "#445", fontSize: 10, marginLeft: "auto" }}>Refreshing…</span>}
        <button
          onClick={() => setOpen(false)}
          style={{ marginLeft: loading ? 8 : "auto", background: "none", border: "none", color: "#556", cursor: "pointer", fontSize: 14 }}
        >
          ✕
        </button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", flexWrap: "wrap" }}>
        <div style={TILE_STYLE(RED)}>
          <div style={{ fontSize: 18, fontWeight: 700, color: RED }}>{assessed.length}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>SIGNALS</div>
        </div>
        <div style={TILE_STYLE(CY)}>
          <div style={{ fontSize: 18, fontWeight: 700, color: CY }}>{kbItems.length}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>KB ARTICLES</div>
        </div>
        <div style={TILE_STYLE(AMBER)}>
          <div style={{ fontSize: 18, fontWeight: 700, color: AMBER }}>{skills.length}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>SKILLS</div>
        </div>
        <div style={TILE_STYLE(GREEN)}>
          <div style={{ fontSize: 18, fontWeight: 700, color: GREEN }}>{counts.FULLY_MITIGATED}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>FULLY MITIGATED</div>
        </div>
        <div style={{
          ...TILE_STYLE(RED),
          animation: counts.UNMITIGATED > 0 ? "rksm-pulse 2s ease-in-out infinite" : "none",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: RED }}>{counts.UNMITIGATED}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>UNMITIGATED</div>
        </div>
      </div>

      {/* filter tabs + search */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 14px", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? "rgba(255,61,90,0.15)" : "none",
            border: `1px solid ${filter === t ? RED : "#334"}`,
            color: filter === t ? RED : "#889",
            padding: "2px 8px", fontSize: 10, cursor: "pointer", borderRadius: 3,
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search signal/type…"
          style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid #334",
            color: "#cde", padding: "2px 8px", fontSize: 11, borderRadius: 3,
            marginLeft: "auto", width: 200,
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 14px" }}>
        {loading && <div style={{ color: "#556", textAlign: "center", padding: 20 }}>Loading…</div>}
        {!loading && displayed.length === 0 && (
          <div style={{ color: "#556", textAlign: "center", padding: 20 }}>No signals match.</div>
        )}
        {displayed.map((risk) => {
          const isExpanded = expanded === risk.id;
          const clsCol = CLASS_COLOR[risk.cls];
          const sevCol = SEV_COLOR[risk.severity] || AMBER;
          const maxScore = Math.max(
            ...risk.matchedKb.map((k) => k.score),
            ...risk.matchedSkills.map((s) => s.score),
            1,
          );
          return (
            <div key={risk.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(isExpanded ? null : risk.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: "pointer" }}
              >
                <span style={{ color: clsCol, fontSize: 9, minWidth: 110, fontWeight: 700 }}>
                  {risk.cls.replace(/_/g, " ")}
                </span>
                <span style={{ flex: 1, color: "#cde", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {risk.title}
                </span>
                {risk.type && (
                  <span style={{ color: "#556", fontSize: 10, whiteSpace: "nowrap" }}>{risk.type}</span>
                )}
                <span style={{ color: sevCol, fontSize: 9, minWidth: 50, textAlign: "right", fontWeight: 700 }}>
                  {risk.severity.toUpperCase()}
                </span>
                <span style={{ color: "#445", fontSize: 10 }}>{isExpanded ? "▲" : "▼"}</span>
              </div>

              {isExpanded && (
                <div style={{ padding: "4px 0 8px 16px" }}>
                  {risk.matchedKb.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: CY, fontSize: 10, marginBottom: 3 }}>Matched KB articles</div>
                      {risk.matchedKb.map((k) => (
                        <div key={k.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#cde" }}>{k.title}</span>
                            <span style={{ color: "#556", fontSize: 10 }}>{k.subject}</span>
                          </div>
                          {BAR(k.score, maxScore, CY)}
                        </div>
                      ))}
                    </div>
                  )}
                  {risk.matchedSkills.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: AMBER, fontSize: 10, marginBottom: 3 }}>Matched skills</div>
                      {risk.matchedSkills.map((s) => (
                        <div key={s.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#cde" }}>{s.name}</span>
                            <span style={{ color: "#556", fontSize: 10 }}>{s.category}</span>
                          </div>
                          {BAR(s.score, maxScore, AMBER)}
                        </div>
                      ))}
                    </div>
                  )}
                  {risk.matchedKb.length === 0 && risk.matchedSkills.length === 0 && (
                    <div style={{ color: RED, fontSize: 10 }}>
                      No knowledge backing or skill coverage — unmitigated response gap.
                    </div>
                  )}
                  <button
                    onClick={() => assess(risk)}
                    style={{
                      marginTop: 6, background: "none", border: `1px solid ${RED}66`,
                      color: RED, padding: "2px 10px", fontSize: 10, cursor: "pointer", borderRadius: 3,
                    }}
                  >
                    ▶ ASSESS
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes rksm-pulse {
          0%,100% { box-shadow: 0 0 4px ${RED}55; }
          50%      { box-shadow: 0 0 12px ${RED}cc; }
        }
      `}</style>
    </div>
  );
}
