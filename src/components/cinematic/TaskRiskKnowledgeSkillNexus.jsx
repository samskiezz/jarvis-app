/**
 * TaskRiskKnowledgeSkillNexus — F274.
 *
 * Parallel-fetches /entities/Task × /entities/RiskSignal × /knowledge/ × /v1/aip/skill
 * and keyword-correlates each task against risk signals, KB articles, and AIP skills:
 *
 *   FULLY_ARMED    — task has ≥1 match in all three: risk signal + KB article + AIP skill
 *   DUAL_RESOURCED — task matches any two of the three sources
 *   SINGLE_LINKED  — task matches exactly one source
 *   BARE           — no matching risk signal, KB article, or AIP skill
 *
 * Stat tiles: TASKS / RISKS / KB / SKILLS / BARE
 * Amber badge: BARE count on toggle button; bare rows pulse amber.
 * Filter tabs: ALL | FULLY_ARMED | DUAL_RESOURCED | SINGLE_LINKED | BARE + text search.
 * Expand task → matched risk signal cards (red) + KB article cards (green) + AIP skill cards (cyan)
 *   with relevance bars.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence operational intel coverage brief + TTS.
 *
 * Toggle:  ◈ TIKSNEX at left:1109600, bottom:8, zIndex:697.
 * Event:   jarvis:tiksnex-toggle
 * Voice:   "tiksnex" / "task intel nexus" / "task knowledge risk" /
 *          "bare tasks intel" / "task operational intel" / "task skill risk" /
 *          "task risk knowledge" / "task coverage nexus"
 * Refresh: 90s auto-refresh while open.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM  = "#FFB300";
const GN  = "#4CAF50";
const RD  = "#FF3D3D";
const CY  = "#00E5FF";
const DIM = "rgba(255,255,255,0.04)";
const BG  = "rgba(6,10,18,0.94)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 1109600;
const Z_IDX      = 697;

// ── normalisers ───────────────────────────────────────────────────────────────

function normTasks(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.tasks || raw?.items || raw?.data || raw?.results || []);
  return arr.map((t, i) => ({
    id:   t.id   || t._id   || `tk${i}`,
    name: t.name || t.title || t.task_name || `Task ${i + 1}`,
    desc: t.description || t.summary || t.detail || "",
    status: t.status || t.state || "",
    priority: t.priority || t.urgency || "",
    tags: Array.isArray(t.tags) ? t.tags : [],
  }));
}

function normRisks(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.signals || raw?.items || raw?.data || raw?.results || []);
  return arr.map((r, i) => ({
    id:       r.id   || r._id   || `rs${i}`,
    name:     r.name || r.title || r.signal_name || `Risk Signal ${i + 1}`,
    severity: r.severity || r.level || r.priority || "",
    desc:     r.description || r.summary || r.detail || "",
    tags:     Array.isArray(r.tags) ? r.tags : [],
  }));
}

function normKb(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.articles || raw?.items || raw?.data || raw?.results || []);
  return arr.map((a, i) => ({
    id:   a.id   || a._id   || `kb${i}`,
    name: a.name || a.title || a.article_title || `Article ${i + 1}`,
    desc: a.description || a.summary || a.content || a.body || "",
    tags: Array.isArray(a.tags) ? a.tags : [],
  }));
}

function normSkills(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.skills || raw?.items || raw?.data || raw?.results || []);
  return arr.map((s, i) => ({
    id:   s.id   || s._id   || `sk${i}`,
    name: s.name || s.skill_name || s.title || `Skill ${i + 1}`,
    type: s.type || s.category || s.skill_type || "",
    desc: s.description || s.summary || s.objective || "",
    tags: Array.isArray(s.tags) ? s.tags : [],
  }));
}

// ── keyword matching ──────────────────────────────────────────────────────────

function kw(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(aWords, bText) {
  const bWords = kw(bText);
  return aWords.filter(w => bWords.includes(w)).length;
}

function matchScore(task, targets, textFn) {
  const tWords = kw(`${task.name} ${task.desc} ${task.status} ${task.priority} ${task.tags.join(" ")}`);
  if (!tWords.length) return 0;
  const best = targets.reduce((mx, t) => {
    const score = overlap(tWords, textFn(t));
    return Math.max(mx, score);
  }, 0);
  return Math.min(100, Math.round((best / Math.max(tWords.length, 1)) * 200));
}

function riskText(r) { return `${r.name} ${r.severity} ${r.desc} ${r.tags.join(" ")}`; }
function kbText(a)   { return `${a.name} ${a.desc} ${a.tags.join(" ")}`; }
function skillText(s){ return `${s.name} ${s.type} ${s.desc} ${s.tags.join(" ")}`; }

function classify(task, risks, kb, skills) {
  const rsScore  = matchScore(task, risks,  riskText);
  const kbScore  = matchScore(task, kb,     kbText);
  const skScore  = matchScore(task, skills, skillText);
  const hasRs = rsScore > 10;
  const hasKb = kbScore > 10;
  const hasSk = skScore > 10;
  const matchCount = [hasRs, hasKb, hasSk].filter(Boolean).length;
  return {
    bucket: matchCount === 3 ? "FULLY_ARMED"
          : matchCount === 2 ? "DUAL_RESOURCED"
          : matchCount === 1 ? "SINGLE_LINKED"
          : "BARE",
    rsScore,
    kbScore,
    skScore,
    matchedRisks:  risks.filter(r => matchScore(task, [r], riskText) > 10).slice(0, 3),
    matchedKb:     kb.filter(a    => matchScore(task, [a], kbText) > 10).slice(0, 3),
    matchedSkills: skills.filter(s => matchScore(task, [s], skillText) > 10).slice(0, 3),
  };
}

const BUCKETS = ["FULLY_ARMED", "DUAL_RESOURCED", "SINGLE_LINKED", "BARE"];
const BUCKET_COLORS = {
  FULLY_ARMED:    GN,
  DUAL_RESOURCED: CY,
  SINGLE_LINKED:  AM,
  BARE:           RD,
};

// ── sub-components ────────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div style={{ background: DIM, border: `1px solid ${color}33`, borderRadius: 8, padding: "6px 10px", textAlign: "center", minWidth: 66 }}>
      <div style={{ color, fontFamily: MN, fontSize: 18, fontWeight: 700 }}>{value}</div>
      <div style={{ color: "rgba(255,255,255,0.45)", fontFamily: MN, fontSize: 9, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function RelevanceBar({ score, color }) {
  return (
    <div style={{ height: 3, background: "rgba(0,0,0,0.3)", borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${score}%`, background: color, transition: "width 0.4s ease" }} />
    </div>
  );
}

function TiksnexPanel({ tasks, risks, kb, skills, base }) {
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);

  const rows = tasks.map(t => ({ ...t, ...classify(t, risks, kb, skills) }));
  const counts = Object.fromEntries(BUCKETS.map(b => [b, rows.filter(r => r.bucket === b).length]));
  const covPct = rows.length
    ? Math.round(((counts.FULLY_ARMED + counts.DUAL_RESOURCED * 0.67 + counts.SINGLE_LINKED * 0.33) / rows.length) * 100)
    : 0;

  const visible = rows
    .filter(r => filter === "ALL" || r.bucket === filter)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
    const prompt = `TIKSNEX: ${rows.length} tasks assessed for operational intel coverage. FULLY_ARMED: ${counts.FULLY_ARMED}, DUAL_RESOURCED: ${counts.DUAL_RESOURCED}, SINGLE_LINKED: ${counts.SINGLE_LINKED}, BARE: ${counts.BARE}. Coverage: ${covPct}%. Provide a 2-sentence operational intel readiness assessment.`;
    try {
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data.response || data.message || data.content || data.answer || "TIKSNEX assessment complete.";
      try {
        const voice = getActiveVoice ? getActiveVoice() : "ash";
        const tv = await fetch(`${base}/v1/voice/tts`, {
          method: "POST", headers: hdrs,
          body: JSON.stringify({ text, voice }),
        });
        const blob = await tv.blob();
        new Audio(URL.createObjectURL(blob)).play();
      } catch {}
    } catch {}
  }

  return (
    <div style={{ padding: "10px 16px 14px" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <StatTile label="TASKS"   value={rows.length}        color={CY} />
        <StatTile label="RISKS"   value={risks.length}       color={RD} />
        <StatTile label="KB"      value={kb.length}          color={GN} />
        <StatTile label="SKILLS"  value={skills.length}      color={AM} />
        <StatTile label="BARE"    value={counts.BARE}        color={RD} />
        <StatTile label="COV%"    value={`${covPct}%`}       color={covPct >= 70 ? GN : covPct >= 40 ? AM : RD} />
      </div>

      <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, height: 6, marginBottom: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${covPct}%`, background: covPct >= 70 ? GN : covPct >= 40 ? AM : RD, transition: "width 0.6s ease" }} />
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
        {["ALL", ...BUCKETS].map(b => (
          <button key={b} onClick={() => setFilter(b)} style={{
            background: filter === b ? (BUCKET_COLORS[b] || CY) + "33" : DIM,
            border: `1px solid ${filter === b ? (BUCKET_COLORS[b] || CY) : "rgba(255,255,255,0.1)"}`,
            borderRadius: 5, color: filter === b ? (BUCKET_COLORS[b] || CY) : "rgba(255,255,255,0.5)",
            fontFamily: MN, fontSize: 9, padding: "3px 8px", cursor: "pointer", letterSpacing: 1,
          }}>{b === "ALL" ? `ALL (${rows.length})` : `${b} (${counts[b]})`}</button>
        ))}
      </div>

      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search tasks…"
        style={{
          width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 5, color: "rgba(255,255,255,0.8)", fontFamily: MN, fontSize: 10,
          padding: "5px 10px", marginBottom: 10, boxSizing: "border-box",
        }}
      />

      <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.map(r => (
          <div key={r.id} style={{
            background: r.bucket === "BARE" ? "rgba(255,61,61,0.06)" : DIM,
            border: `1px solid ${(BUCKET_COLORS[r.bucket] || CY)}33`,
            borderRadius: 7, padding: "7px 10px",
            animation: r.bucket === "BARE" ? "tiksnex-pulse 2s infinite" : "none",
          }}>
            <div
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{
                  background: (BUCKET_COLORS[r.bucket] || CY) + "22",
                  border: `1px solid ${(BUCKET_COLORS[r.bucket] || CY)}55`,
                  borderRadius: 4, color: BUCKET_COLORS[r.bucket] || CY,
                  fontFamily: MN, fontSize: 8, padding: "1px 5px", letterSpacing: 1,
                }}>{r.bucket}</span>
                <span style={{ color: "rgba(255,255,255,0.85)", fontFamily: MN, fontSize: 10 }}>{r.name}</span>
                {r.status && <span style={{ color: "rgba(255,255,255,0.35)", fontFamily: MN, fontSize: 9 }}>· {r.status}</span>}
              </div>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>{expanded === r.id ? "▲" : "▼"}</span>
            </div>

            {expanded === r.id && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                {r.matchedRisks.length > 0 && (
                  <div>
                    <div style={{ color: RD, fontFamily: MN, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>
                      RISK SIGNALS ({r.matchedRisks.length})
                    </div>
                    {r.matchedRisks.map(rs => (
                      <div key={rs.id} style={{ background: RD + "11", border: `1px solid ${RD}33`, borderRadius: 5, padding: "4px 8px", marginBottom: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "rgba(255,255,255,0.75)", fontFamily: MN, fontSize: 10 }}>{rs.name}</span>
                          {rs.severity && (
                            <span style={{ background: RD + "22", border: `1px solid ${RD}44`, borderRadius: 3, color: RD, fontFamily: MN, fontSize: 8, padding: "1px 5px" }}>
                              {rs.severity.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <RelevanceBar score={matchScore(r, [rs], riskText)} color={RD} />
                      </div>
                    ))}
                  </div>
                )}

                {r.matchedKb.length > 0 && (
                  <div>
                    <div style={{ color: GN, fontFamily: MN, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>
                      KB ARTICLES ({r.matchedKb.length})
                    </div>
                    {r.matchedKb.map(a => (
                      <div key={a.id} style={{ background: GN + "11", border: `1px solid ${GN}33`, borderRadius: 5, padding: "4px 8px", marginBottom: 3 }}>
                        <span style={{ color: "rgba(255,255,255,0.75)", fontFamily: MN, fontSize: 10 }}>{a.name}</span>
                        <RelevanceBar score={matchScore(r, [a], kbText)} color={GN} />
                      </div>
                    ))}
                  </div>
                )}

                {r.matchedSkills.length > 0 && (
                  <div>
                    <div style={{ color: CY, fontFamily: MN, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>
                      AIP SKILLS ({r.matchedSkills.length})
                    </div>
                    {r.matchedSkills.map(s => (
                      <div key={s.id} style={{ background: CY + "11", border: `1px solid ${CY}33`, borderRadius: 5, padding: "4px 8px", marginBottom: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "rgba(255,255,255,0.75)", fontFamily: MN, fontSize: 10 }}>{s.name}</span>
                          {s.type && (
                            <span style={{ background: CY + "22", border: `1px solid ${CY}44`, borderRadius: 3, color: CY, fontFamily: MN, fontSize: 8, padding: "1px 5px" }}>
                              {s.type}
                            </span>
                          )}
                        </div>
                        <RelevanceBar score={matchScore(r, [s], skillText)} color={CY} />
                      </div>
                    ))}
                  </div>
                )}

                {r.matchedRisks.length === 0 && r.matchedKb.length === 0 && r.matchedSkills.length === 0 && (
                  <div style={{ color: "rgba(255,255,255,0.3)", fontFamily: MN, fontSize: 10 }}>
                    No matched risks, KB articles, or skills.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && (
          <div style={{ color: "rgba(255,255,255,0.3)", fontFamily: MN, fontSize: 10, padding: "10px 0" }}>
            No tasks match current filter.
          </div>
        )}
      </div>

      <style>{`@keyframes tiksnex-pulse { 0%,100%{opacity:1}50%{opacity:0.55} }`}</style>

      <button onClick={assess} style={{
        marginTop: 10, background: GN + "22", border: `1px solid ${GN}55`, borderRadius: 6,
        color: GN, fontFamily: MN, fontSize: 10, padding: "5px 14px", cursor: "pointer", letterSpacing: 1,
      }}>▶ ASSESS COVERAGE</button>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function TaskRiskKnowledgeSkillNexus() {
  const [open, setOpen]     = useState(false);
  const [tasks, setTasks]   = useState([]);
  const [risks, setRisks]   = useState([]);
  const [kb, setKb]         = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const base = apiBase();
      const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const [tRes, rRes, kRes, sRes] = await Promise.all([
        fetch(`${base}/entities/Task`,       { headers: hdrs }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdrs }),
        fetch(`${base}/knowledge/`,          { headers: hdrs }),
        fetch(`${base}/v1/aip/skill`,        { headers: hdrs }),
      ]);
      const [tRaw, rRaw, kRaw, sRaw] = await Promise.all([
        tRes.json(), rRes.json(), kRes.json(), sRes.json(),
      ]);
      setTasks(normTasks(tRaw));
      setRisks(normRisks(rRaw));
      setKb(normKb(kRaw));
      setSkills(normSkills(sRaw));
    } catch (e) {
      setError(`Load failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen(o => {
        if (!o) load();
        return !o;
      });
    };
    window.addEventListener("jarvis:tiksnex-toggle", toggle);
    return () => window.removeEventListener("jarvis:tiksnex-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const bareCount = tasks.length
    ? tasks.filter(t => {
        const c = classify(t, risks, kb, skills);
        return c.bucket === "BARE";
      }).length
    : 0;

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Task × RiskSignal × Knowledge × AIP Skill Operational Intel Nexus"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_IDX,
          background: "rgba(6,10,18,0.82)", border: `1px solid ${CY}55`, borderRadius: 7,
          color: CY, fontFamily: MN, fontSize: 10, letterSpacing: 1,
          padding: "5px 9px", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: `0 0 14px ${CY}22`,
        }}
      >
        ◈ TIKSNEX
        {bareCount > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000", borderRadius: 9, fontSize: 9,
            fontWeight: 700, padding: "1px 5px",
          }}>{bareCount}</span>
        )}
      </button>
    );
  }

  const base = apiBase();

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 560, bottom: 48, zIndex: Z_IDX,
      background: BG, border: `1px solid ${CY}55`, borderRadius: 14,
      boxShadow: `0 0 50px ${CY}18`, backdropFilter: "blur(14px)",
      minWidth: 540, maxWidth: 700,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 0" }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 2 }}>
          ◈ TIKSNEX — Task × Risk × Knowledge × Skill Nexus
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>
      {loading && (
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, padding: "14px 18px" }}>
          Loading task intel coverage…
        </div>
      )}
      {error && <div style={{ color: RD, fontSize: 11, padding: "10px 18px" }}>{error}</div>}
      {!loading && !error && tasks.length > 0 && (
        <TiksnexPanel tasks={tasks} risks={risks} kb={kb} skills={skills} base={base} />
      )}
      {!loading && !error && tasks.length === 0 && (
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "14px 18px" }}>
          No task data available.
        </div>
      )}
    </div>
  );
}

// ── exports for JarvisBrain wiring ───────────────────────────────────────────

const TIKSNEX_RE =
  /\b(tiksnex|task[._\-\s]intel[._\-\s]nexus|task[._\-\s]knowledge[._\-\s]risk|bare[._\-\s]tasks?[._\-\s]intel|task[._\-\s]operational[._\-\s]intel|task[._\-\s]skill[._\-\s]risk|task[._\-\s]risk[._\-\s]knowledge|task[._\-\s]coverage[._\-\s]nexus)\b/i;

export function isTiksnexQuery(text) {
  return TIKSNEX_RE.test(text || "");
}

export async function buildTiksnexScript() {
  const base = apiBase();
  const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  try {
    const [tRes, rRes, kRes, sRes] = await Promise.all([
      fetch(`${base}/entities/Task`,       { headers: hdrs }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdrs }),
      fetch(`${base}/knowledge/`,          { headers: hdrs }),
      fetch(`${base}/v1/aip/skill`,        { headers: hdrs }),
    ]);
    const [tRaw, rRaw, kRaw, sRaw] = await Promise.all([
      tRes.json(), rRes.json(), kRes.json(), sRes.json(),
    ]);
    const tasks  = normTasks(tRaw);
    const risks  = normRisks(rRaw);
    const kb     = normKb(kRaw);
    const skills = normSkills(sRaw);
    const rows   = tasks.map(t => ({ ...t, ...classify(t, risks, kb, skills) }));
    const armed  = rows.filter(r => r.bucket === "FULLY_ARMED").length;
    const bare   = rows.filter(r => r.bucket === "BARE").length;
    const covPct = rows.length
      ? Math.round(((armed + rows.filter(r => r.bucket === "DUAL_RESOURCED").length * 0.67 + rows.filter(r => r.bucket === "SINGLE_LINKED").length * 0.33) / rows.length) * 100)
      : 0;
    return `TIKSNEX online, sir. ${tasks.length} tasks assessed across ${risks.length} risk signals, ${kb.length} KB articles, and ${skills.length} AIP skills. ${armed} tasks are fully armed with all three resources; ${bare} are bare with no operational intel coverage. Overall readiness stands at ${covPct}%.`;
  } catch {
    return "TIKSNEX online, sir. Assessing task operational intelligence coverage across risk signals, knowledge base, and AIP skills.";
  }
}
