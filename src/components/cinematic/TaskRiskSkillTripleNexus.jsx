/**
 * TaskRiskSkillTripleNexus — F714
 *
 * Polls /entities/Task × /entities/RiskSignal × /v1/aip/skill every 90 s.
 * 3-way keyword cross-reference classifies tasks as:
 *   FULLY_COVERED — at least 1 risk signal AND 1 skill keyword-match
 *   RISK_ONLY     — ≥1 risk signal match, no skill match
 *   SKILL_ONLY    — ≥1 skill match, no risk match
 *   CLEAR         — no match in either dimension (unaddressed tasks)
 *
 * Voice: "trskskl" | "task risk skill" | "task skill risk"
 *        | "mission readiness" | "task coverage triple"
 *        | "which tasks are covered" | "fully covered tasks"
 *        | "task triple nexus"
 * Strip button: ◈ TRSKSKL   left:890060  bottom:8  zIndex:249
 * Custom event: jarvis:trskskl-toggle
 *
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFB347";
const RED = "#e8203c";
const PRP = "#a78bfa";
const DIM = "#566878";
const POLL = 90_000;
const BTN_LEFT = 890060;
const ZIDX = 249;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TRSKSKL_RE =
  /\b(trskskl|task[.\s-]*risk[.\s-]*skill|task[.\s-]*skill[.\s-]*risk|mission[.\s-]*readiness|task[.\s-]*coverage[.\s-]*triple|which[.\s-]*tasks[.\s-]*are[.\s-]*covered|fully[.\s-]*covered[.\s-]*tasks?|task[.\s-]*triple[.\s-]*nexus)\b/i;

export function isTrsksklQuery(q) {
  return TRSKSKL_RE.test(q || "");
}

export async function buildTrsksklScript() {
  try {
    const [tr, rr, sr] = await Promise.all([
      fetch(`${apiBase()}/entities/Task`,         { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/entities/RiskSignal`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/aip/skill`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const td = tr.ok ? await tr.json() : {};
    const rd = rr.ok ? await rr.json() : {};
    const sd = sr.ok ? await sr.json() : {};
    const tasks  = Array.isArray(td) ? td : (td?.results ?? []);
    const risks  = Array.isArray(rd) ? rd : (rd?.results ?? []);
    const skills = Array.isArray(sd) ? sd : (sd?.results ?? []);

    const taskArr  = Array.isArray(tasks)  ? tasks  : [];
    const riskArr  = Array.isArray(risks)  ? risks  : [];
    const skillArr = Array.isArray(skills) ? skills : [];

    if (!taskArr.length)
      return "Task data is unavailable at present, sir.";

    const riskTokens = new Set(
      riskArr.flatMap(r =>
        `${r.title||""} ${r.description||""} ${r.source||""}`
          .toLowerCase().split(/\W+/).filter(t => t.length > 3)
      )
    );
    const skillTokens = new Set(
      skillArr.flatMap(s =>
        `${s.name||""} ${s.domain||""} ${s.description||""}`
          .toLowerCase().split(/\W+/).filter(t => t.length > 3)
      )
    );

    let fullyCovered = 0, riskOnly = 0, skillOnly = 0, clear = 0;
    for (const t of taskArr) {
      const words = `${t.title||""} ${t.description||""} ${t.kind||""}`
        .toLowerCase().split(/\W+/).filter(w => w.length > 3);
      const hasRisk  = words.some(w => riskTokens.has(w));
      const hasSkill = words.some(w => skillTokens.has(w));
      if (hasRisk && hasSkill) fullyCovered++;
      else if (hasRisk)        riskOnly++;
      else if (hasSkill)       skillOnly++;
      else                     clear++;
    }

    const pct = taskArr.length
      ? Math.round((fullyCovered / taskArr.length) * 100) : 0;

    const brief = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Task × Risk Signal × Skill triple nexus: ${taskArr.length} tasks, ${riskArr.length} risk signals, ${skillArr.length} skills. ${fullyCovered} tasks (${pct}%) are FULLY COVERED (risk+skill), ${riskOnly} risk-only, ${skillOnly} skill-only, ${clear} unaddressed. Provide a 2-sentence mission readiness assessment.`,
      }),
    }).then(r => r.ok ? r.json() : null).then(d => d?.response || d?.reply || "").catch(() => "");

    return (
      `Task × Risk Signal × Skill Triple Nexus, sir. ${taskArr.length} tasks evaluated. ` +
      `${fullyCovered} (${pct}%) are fully covered by both risk intelligence and skill backing. ` +
      `${riskOnly} risk-only, ${skillOnly} skill-only, ${clear} unaddressed. ` +
      (brief || "")
    ).trim();
  } catch {
    return "I was unable to retrieve the task risk skill nexus at this time, sir.";
  }
}

const PANEL = {
  position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
  zIndex: ZIDX + 10, width: "min(600px,95vw)",
  background: "rgba(4,8,14,0.94)", border: `1px solid ${CY}44`, borderRadius: 12,
  backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
  boxShadow: `0 0 48px ${CY}18`, fontFamily: "'JetBrains Mono',monospace",
  color: "#DCEBF5", overflow: "hidden",
};
const HDR = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
  background: "rgba(41,231,255,0.05)",
};

function kw(str) {
  return str.toLowerCase().split(/\W+/).filter(t => t.length > 3);
}

function severityColor(sev) {
  if (!sev) return DIM;
  const s = sev.toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return AMB;
  if (s === "MEDIUM")   return "#f59e0b";
  if (s === "LOW")      return GRN;
  return DIM;
}

function statusColor(st) {
  if (!st) return DIM;
  const s = st.toUpperCase();
  if (s === "BLOCKED")     return RED;
  if (s === "IN_PROGRESS") return CY;
  if (s === "DONE")        return GRN;
  if (s === "PENDING")     return AMB;
  return DIM;
}

function classify(hasRisk, hasSkill) {
  if (hasRisk && hasSkill) return "FULLY_COVERED";
  if (hasRisk)             return "RISK_ONLY";
  if (hasSkill)            return "SKILL_ONLY";
  return "CLEAR";
}

function classBadgeColor(cls) {
  if (cls === "FULLY_COVERED") return GRN;
  if (cls === "RISK_ONLY")     return AMB;
  if (cls === "SKILL_ONLY")    return PRP;
  return DIM;
}

export default function TaskRiskSkillTripleNexus() {
  const [open, setOpen]   = useState(false);
  const [tasks,  setTasks]  = useState([]);
  const [risks,  setRisks]  = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoad]  = useState(false);
  const [err, setErr]       = useState(null);
  const [tab, setTab]       = useState("ALL");
  const [q, setQ]           = useState("");
  const [expanded, setExp]  = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoad(true); setErr(null);
    try {
      const [tr, rr, sr] = await Promise.all([
        fetch(`${apiBase()}/entities/Task`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/aip/skill`,        { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const td = tr.ok ? await tr.json() : {};
      setTasks(Array.isArray(td) ? td : (td?.results ?? []));
      const rd = rr.ok ? await rr.json() : {};
      setRisks(Array.isArray(rd) ? rd : (rd?.results ?? []));
      const sd = sr.ok ? await sr.json() : {};
      setSkills(Array.isArray(sd) ? sd : (sd?.results ?? []));
    } catch (e) { setErr(e.message); }
    finally { setLoad(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:trskskl-toggle", h);
    return () => window.removeEventListener("jarvis:trskskl-toggle", h);
  }, []);

  const riskTokenSet = new Set(
    risks.flatMap(r => kw(`${r.title||""} ${r.description||""} ${r.source||""}`))
  );
  const skillTokenSet = new Set(
    skills.flatMap(s => kw(`${s.name||""} ${s.domain||""} ${s.description||""}`))
  );

  const enriched = tasks.map(t => {
    const words     = kw(`${t.title||""} ${t.description||""} ${t.kind||""}`);
    const riskHits  = words.filter(w => riskTokenSet.has(w)).length;
    const skillHits = words.filter(w => skillTokenSet.has(w)).length;
    const hasRisk   = riskHits  > 0;
    const hasSkill  = skillHits > 0;
    const cls       = classify(hasRisk, hasSkill);

    const matchedRisks = hasRisk
      ? risks.filter(r => {
          const rw = new Set(kw(`${r.title||""} ${r.description||""} ${r.source||""}`));
          return words.some(w => rw.has(w));
        })
      : [];
    const matchedSkills = hasSkill
      ? skills.filter(s => {
          const sw = new Set(kw(`${s.name||""} ${s.domain||""} ${s.description||""}`));
          return words.some(w => sw.has(w));
        })
      : [];

    return { ...t, riskHits, skillHits, hasRisk, hasSkill, cls, matchedRisks, matchedSkills };
  });

  const fullyCovered = enriched.filter(t => t.cls === "FULLY_COVERED");
  const riskOnly     = enriched.filter(t => t.cls === "RISK_ONLY");
  const skillOnly    = enriched.filter(t => t.cls === "SKILL_ONLY");
  const clear        = enriched.filter(t => t.cls === "CLEAR");
  const pct = tasks.length ? Math.round((fullyCovered.length / tasks.length) * 100) : 0;

  const TABS = ["ALL","FULLY_COVERED","RISK_ONLY","SKILL_ONLY","CLEAR"];
  const visible = enriched
    .filter(t => tab === "ALL" || t.cls === tab)
    .filter(t => !q || (t.title || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Task × Risk Signal × Skill triple nexus"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: ZIDX,
          padding: "4px 10px", background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY, border: `1px solid ${CY}`,
          borderRadius: 6, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ TRSKSKL
        {clear.length > 0 && (
          <span style={{
            marginLeft: 5, background: AMB, color: "#04060A",
            borderRadius: 3, fontSize: 7, padding: "1px 4px", fontWeight: 700,
          }}>{clear.length}</span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={HDR}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
              ◈ Task × Risk Signal × Skill Triple Nexus
            </span>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  fontSize: 7, padding: "2px 6px", borderRadius: 4,
                  border: `1px solid ${tab===t ? CY : "#2a3a4a"}`,
                  background: tab===t ? `${CY}22` : "transparent",
                  color: tab===t ? CY : DIM, cursor: "pointer",
                  fontFamily: "inherit", textTransform: "uppercase", letterSpacing: 1,
                }}>{t.replace("_"," ")}</button>
              ))}
              <button onClick={() => setOpen(false)} style={{
                background:"none", border:"none", color: DIM,
                cursor:"pointer", fontSize:14, marginLeft:4, lineHeight:1,
              }}>×</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
            {[
              ["TASKS",        tasks.length,         CY],
              ["FULLY COV.",   fullyCovered.length,  GRN],
              ["RISK ONLY",    riskOnly.length,      AMB],
              ["SKILL ONLY",   skillOnly.length,     PRP],
              ["CLEAR",        clear.length,         DIM],
              ["COVERAGE",     `${pct}%`,            pct >= 60 ? GRN : pct >= 30 ? AMB : RED],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                flex: "1 1 70px", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}18`, borderRadius: 8, padding: "6px 8px", textAlign:"center",
              }}>
                <div style={{ fontSize: 15, color: col, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 14px 8px" }}>
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Filter tasks…"
              style={{
                width: "100%", boxSizing: "border-box", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 6, color: "#DCEBF5",
                fontFamily: "inherit", fontSize: 10, padding: "5px 9px", outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ padding: "0 14px 10px", maxHeight: 300, overflowY: "auto" }}>
            {loading && !tasks.length && (
              <div style={{ color: DIM, fontSize: 10 }}>◌ Loading…</div>
            )}
            {err && <div style={{ color: RED, fontSize: 10 }}>⚠ {err}</div>}
            {visible.map((t, i) => (
              <div key={t.id || i}>
                <div
                  onClick={() => setExp(exp => exp === i ? null : i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "5px 0",
                    borderBottom: "1px solid rgba(41,231,255,0.06)", cursor: "pointer",
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: classBadgeColor(t.cls),
                  }} />
                  {t.status && (
                    <span style={{
                      fontSize: 7, padding: "1px 4px", borderRadius: 3,
                      border: `1px solid ${statusColor(t.status)}55`,
                      color: statusColor(t.status), textTransform: "uppercase",
                      letterSpacing: 1, flexShrink: 0,
                    }}>{t.status}</span>
                  )}
                  <span style={{
                    fontSize: 7, padding: "1px 4px", borderRadius: 3,
                    border: `1px solid ${classBadgeColor(t.cls)}55`,
                    color: classBadgeColor(t.cls), textTransform: "uppercase",
                    letterSpacing: 1, flexShrink: 0,
                  }}>{t.cls.replace("_"," ")}</span>
                  <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.title || t.id || "Unnamed Task"}
                  </span>
                  <span style={{ fontSize: 8, color: DIM, minWidth: 60, textAlign: "right" }}>
                    {t.riskHits > 0 && <span style={{ color: AMB }}>{t.riskHits}r</span>}
                    {t.riskHits > 0 && t.skillHits > 0 && " "}
                    {t.skillHits > 0 && <span style={{ color: PRP }}>{t.skillHits}s</span>}
                    {t.riskHits === 0 && t.skillHits === 0 && <span style={{ color: DIM }}>—</span>}
                  </span>
                </div>
                {expanded === i && (
                  <div style={{ padding: "6px 10px 6px 18px", background: "rgba(41,231,255,0.03)", borderRadius: 6, marginBottom: 4 }}>
                    {t.description && (
                      <div style={{ fontSize: 10, color: "#DCEBF5", marginBottom: 6 }}>{t.description}</div>
                    )}

                    {/* Matched Risk Signals */}
                    {t.matchedRisks.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 8, color: AMB, marginBottom: 3 }}>
                          ⚡ {t.matchedRisks.length} risk signal{t.matchedRisks.length !== 1 ? "s" : ""}:
                        </div>
                        {t.matchedRisks.slice(0, 3).map((r, j) => (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            {r.severity && (
                              <span style={{
                                fontSize: 7, padding: "1px 5px", borderRadius: 3,
                                border: `1px solid ${severityColor(r.severity)}55`,
                                color: severityColor(r.severity),
                                textTransform: "uppercase", letterSpacing: 1,
                              }}>{r.severity}</span>
                            )}
                            <span style={{ fontSize: 9, color: "#DCEBF5" }}>
                              {r.title || r.id || "Unknown Risk"}
                            </span>
                          </div>
                        ))}
                        {t.matchedRisks.length > 3 && (
                          <div style={{ fontSize: 8, color: DIM }}>+{t.matchedRisks.length - 3} more</div>
                        )}
                      </div>
                    )}

                    {/* Matched Skills */}
                    {t.matchedSkills.length > 0 && (
                      <div>
                        <div style={{ fontSize: 8, color: PRP, marginBottom: 3 }}>
                          ◈ {t.matchedSkills.length} skill{t.matchedSkills.length !== 1 ? "s" : ""}:
                        </div>
                        {t.matchedSkills.slice(0, 3).map((s, j) => (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            {s.domain && (
                              <span style={{
                                fontSize: 7, padding: "1px 5px", borderRadius: 3,
                                border: `1px solid ${PRP}55`,
                                color: PRP, textTransform: "uppercase", letterSpacing: 1,
                              }}>{s.domain}</span>
                            )}
                            <span style={{ fontSize: 9, color: "#DCEBF5" }}>
                              {s.name || s.id || "Unknown Skill"}
                            </span>
                            {s.score != null && (
                              <span style={{ fontSize: 8, color: DIM, marginLeft: "auto" }}>
                                {Math.round(s.score * 100)}%
                              </span>
                            )}
                          </div>
                        ))}
                        {t.matchedSkills.length > 3 && (
                          <div style={{ fontSize: 8, color: DIM }}>+{t.matchedSkills.length - 3} more</div>
                        )}
                      </div>
                    )}

                    {t.matchedRisks.length === 0 && t.matchedSkills.length === 0 && (
                      <div style={{ fontSize: 9, color: DIM }}>No matching risk signals or skills</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!loading && !err && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 10 }}>No tasks match.</div>
            )}
          </div>

          <div style={{
            padding: "6px 14px", borderTop: `1px solid rgba(41,231,255,0.06)`,
            fontSize: 8, color: DIM, display: "flex", justifyContent: "space-between",
          }}>
            <span>Source: /entities/Task × /entities/RiskSignal × /v1/aip/skill</span>
            <span style={{ color: loading ? AMB : GRN }}>
              {loading ? "◌ updating" : `${visible.length} shown · ${tab.replace("_"," ")}`}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
