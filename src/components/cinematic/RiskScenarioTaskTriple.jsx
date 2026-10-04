/**
 * RiskScenarioTaskTriple — F665
 * "JARVIS, rststri / risk scenario task / triple risk / converged risk /
 *  risk triple / fully operationalized / risk coverage triple / scenario task risk"
 *
 * 3-way cross-reference: /entities/RiskSignal × /v1/scenario/list × /entities/Task
 * CONVERGENT — risk has ≥1 scenario match AND ≥1 task match (fully operationalized)
 * SCRIPTED   — risk has scenario but no task match (planned, not actioned)
 * TASKED     — risk has task but no scenario match (actioned, not scripted)
 * BLIND      — no scenario, no task (intelligence gap)
 *
 * Coverage % tile; ALL/CONVERGENT/SCRIPTED/TASKED/BLIND filter tabs + search;
 * click-to-expand matched scenarios + tasks per risk;
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS;
 * amber badge on BLIND count; 90-s auto-refresh.
 * ◈ RSTSTRI button left:122580 bottom:8 zIndex:201.
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";
const PUR = "#BB88FF";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 122_580;
const Z_INDEX  = 201;

const RSTSTRI_RE =
  /\brststri\b|\brisk.?scenario.?task\b|\btriple.?risk\b|\bconverged?.?risk\b|\brisk.?triple\b|\bfully.?operationalize\b|\brisk.?coverage.?triple\b|\bscenario.?task.?risk\b/i;

export function isRststriQuery(text) {
  return RSTSTRI_RE.test(text || "");
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

function riskText(r) {
  return [r.title, r.name, r.description, r.signal, r.type, r.severity,
          r.source, r.category, r.tags, r.notes]
    .filter(Boolean).join(" ");
}

function scenarioText(s) {
  return [s.title, s.name, s.description, s.kind, s.type, s.tags, s.category]
    .filter(Boolean).join(" ");
}

function taskText(t) {
  return [t.title, t.name, t.description, t.notes, t.status, t.priority,
          t.assignee, t.tags, t.category, t.label]
    .filter(Boolean).join(" ");
}

function normalise(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

const SEV_COLOR = { CRITICAL: RED, HIGH: "#FF8844", MEDIUM: AMB, LOW: GRN };
const KIND_COLOR = { convergent: GRN, scripted: CY, tasked: AMB, blind: DIM };

function classifyRisk(risk, scenarios, tasks) {
  const rt = riskText(risk);
  const matchedScenarios = scenarios.filter((s) => overlap(rt, scenarioText(s)) > 0);
  const matchedTasks     = tasks.filter((t) => overlap(rt, taskText(t)) > 0);
  const hasSc = matchedScenarios.length > 0;
  const hasTk = matchedTasks.length > 0;
  let classification;
  if (hasSc && hasTk) classification = "convergent";
  else if (hasSc)     classification = "scripted";
  else if (hasTk)     classification = "tasked";
  else                classification = "blind";
  return { risk, matchedScenarios, matchedTasks, classification };
}

export async function buildRststriScript() {
  const BASE = apiBase();
  const [rR, sR, tR] = await Promise.allSettled([
    fetch(`${BASE}/entities/RiskSignal`).then((r) => r.json()),
    fetch(`${BASE}/v1/scenario/list`).then((r) => r.json()),
    fetch(`${BASE}/entities/Task`).then((r) => r.json()),
  ]);
  const risks     = normalise(rR.value, ["items","risks","signals","data"]);
  const scenarios = normalise(sR.value, ["items","scenarios","data"]);
  const tasks     = normalise(tR.value, ["items","tasks","data"]);
  const rows = risks.map((r) => classifyRisk(r, scenarios, tasks));
  const convergent = rows.filter((r) => r.classification === "convergent").length;
  const scripted   = rows.filter((r) => r.classification === "scripted").length;
  const tasked     = rows.filter((r) => r.classification === "tasked").length;
  const blind      = rows.filter((r) => r.classification === "blind").length;
  const total      = rows.length;
  const coverage   = total ? Math.round((convergent / total) * 100) : 0;
  window.dispatchEvent(new CustomEvent("jarvis:rststri-toggle"));
  const prompt = `We have ${total} risk signals. ${convergent} are fully operationalized (have both a scenario and a task). ${scripted} are scripted only, ${tasked} are tasked only, and ${blind} are blind with no coverage. Convergence coverage is ${coverage}%. In 2 sentences, assess operational readiness and the most urgent gap.`;
  try {
    const r = await fetch(`${BASE}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: prompt }),
    });
    const d = await r.json();
    return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
      `${convergent} risks fully operationalized, ${blind} blind. Convergence ${coverage}%.`;
  } catch {
    return `${convergent} risks fully operationalized (both scenario + task), ${blind} blind gaps. Convergence ${coverage}%.`;
  }
}

export default function RiskScenarioTaskTriple() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const BASE = apiBase();
      const [rR, sR, tR] = await Promise.allSettled([
        fetch(`${BASE}/entities/RiskSignal`).then((r) => r.json()),
        fetch(`${BASE}/v1/scenario/list`).then((r) => r.json()),
        fetch(`${BASE}/entities/Task`).then((r) => r.json()),
      ]);
      const risks     = normalise(rR.value, ["items","risks","signals","data"]);
      const scenarios = normalise(sR.value, ["items","scenarios","data"]);
      const tasks     = normalise(tR.value, ["items","tasks","data"]);
      setRows(risks.map((r) => classifyRisk(r, scenarios, tasks)));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:rststri-toggle", toggle);
    return () => window.removeEventListener("jarvis:rststri-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const convergent = rows.filter((r) => r.classification === "convergent").length;
  const scripted   = rows.filter((r) => r.classification === "scripted").length;
  const tasked     = rows.filter((r) => r.classification === "tasked").length;
  const blind      = rows.filter((r) => r.classification === "blind").length;
  const total      = rows.length;
  const coverage   = total ? Math.round((convergent / total) * 100) : 0;

  const visible = rows.filter((row) => {
    if (filter !== "ALL" && row.classification.toUpperCase() !== filter) return false;
    if (search) {
      const txt = riskText(row.risk).toLowerCase();
      if (!txt.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessment("");
    try {
      const BASE = apiBase();
      const prompt = `We have ${total} risk signals: ${convergent} fully operationalized (scenario+task), ${scripted} scripted only, ${tasked} tasked only, ${blind} blind. Coverage ${coverage}%. In 2 sentences, assess operational readiness and what to do about the blind gaps.`;
      const r = await fetch(`${BASE}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(txt);
      if (txt) {
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: txt }),
        });
      }
    } catch { setAssessment("Unable to reach reasoning core."); }
    setAssessing(false);
  }

  const TABS = ["ALL","CONVERGENT","SCRIPTED","TASKED","BLIND"];
  const TAB_COLOR = { ALL: CY, CONVERGENT: GRN, SCRIPTED: CY, TASKED: AMB, BLIND: DIM };

  return (
    <>
      {/* fixed toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Risk × Scenario × Task Triple (RSTSTRI)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? AMB : "rgba(5,8,13,0.75)",
          border: `1px solid ${AMB}`, borderRadius: 6, padding: "3px 7px",
          color: open ? "#04060A" : AMB, fontSize: 10, cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
          boxShadow: `0 0 10px ${AMB}44`,
        }}
      >
        {blind > 0 && (
          <span style={{
            position: "absolute", top: -6, right: -6,
            background: AMB, color: "#000", borderRadius: "50%",
            fontSize: 9, minWidth: 16, height: 16, display: "flex",
            alignItems: "center", justifyContent: "center", fontWeight: 700,
          }}>{blind}</span>
        )}
        ◈ RSTSTRI
      </button>

      {open && (
        <div style={{
          position: "fixed", left: BTN_LEFT, bottom: 36, zIndex: Z_INDEX,
          width: "min(540px,90vw)", maxHeight: "70vh", overflow: "hidden",
          background: "rgba(5,8,13,0.93)", border: `1px solid ${AMB}55`,
          borderRadius: 10, padding: "12px 14px",
          backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${AMB}22`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: AMB, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>
              ◈ RISK × SCENARIO × TASK TRIPLE
            </span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
              {loading ? "loading…" : `${total} signals`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
            {[
              { label: "TOTAL",   val: total,      col: CY  },
              { label: "CONVERG", val: convergent, col: GRN },
              { label: "SCRIPT",  val: scripted,   col: CY  },
              { label: "TASKED",  val: tasked,     col: AMB },
              { label: "BLIND",   val: blind,      col: DIM },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 6,
                padding: "6px 4px", textAlign: "center",
                border: `1px solid ${col}33`,
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 6 }}>
            <div style={{
              width: `${coverage}%`, height: "100%", borderRadius: 4,
              background: `linear-gradient(90deg,${GRN},${CY})`,
              transition: "width 0.4s",
            }} />
          </div>
          <div style={{ fontSize: 10, color: DIM, textAlign: "right" }}>
            {coverage}% convergent coverage
          </div>

          {/* tabs + search */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                background: filter === t ? TAB_COLOR[t] : "rgba(255,255,255,0.05)",
                border: `1px solid ${TAB_COLOR[t]}55`, borderRadius: 4,
                color: filter === t ? "#000" : TAB_COLOR[t],
                fontSize: 9, padding: "2px 8px", cursor: "pointer",
                fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="search risks…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.06)",
                border: `1px solid ${DIM}44`, borderRadius: 4,
                color: "#DCEBF5", fontSize: 10, padding: "2px 8px",
                fontFamily: "'JetBrains Mono',monospace", outline: "none",
              }}
            />
          </div>

          {/* rows */}
          <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            {visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 16 }}>
                {loading ? "Loading…" : "No matching risk signals."}
              </div>
            )}
            {visible.map((row, i) => {
              const r = row.risk;
              const cls = row.classification;
              const col = KIND_COLOR[cls];
              const sev = (r.severity || "").toUpperCase();
              const sevCol = SEV_COLOR[sev] || DIM;
              const isExp = expanded === i;
              return (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.04)", borderRadius: 6,
                  border: `1px solid ${col}33`, padding: "6px 10px",
                  cursor: "pointer",
                }} onClick={() => setExpanded(isExp ? null : i)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: 9, padding: "1px 6px", borderRadius: 3,
                      background: `${col}22`, color: col, letterSpacing: 1,
                    }}>{cls.toUpperCase()}</span>
                    {sev && (
                      <span style={{
                        fontSize: 9, padding: "1px 6px", borderRadius: 3,
                        background: `${sevCol}22`, color: sevCol,
                      }}>{sev}</span>
                    )}
                    <span style={{ fontSize: 11, flex: 1, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.title || r.name || r.signal || "Risk Signal"}
                    </span>
                    <span style={{ fontSize: 9, color: DIM }}>
                      {row.matchedScenarios.length}sc / {row.matchedTasks.length}tk
                    </span>
                    <span style={{ fontSize: 10, color: DIM }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      {r.description && (
                        <div style={{ fontSize: 10, color: DIM }}>{r.description}</div>
                      )}
                      {row.matchedScenarios.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 3 }}>
                            SCENARIOS ({row.matchedScenarios.length})
                          </div>
                          {row.matchedScenarios.slice(0, 5).map((s, j) => (
                            <div key={j} style={{ fontSize: 10, color: "#AABBCC", padding: "2px 0" }}>
                              <span style={{ color: CY }}>▶ </span>
                              {s.title || s.name || "Scenario"}
                              {s.kind && <span style={{ color: DIM }}> [{s.kind}]</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {row.matchedTasks.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: AMB, letterSpacing: 1, marginBottom: 3 }}>
                            TASKS ({row.matchedTasks.length})
                          </div>
                          {row.matchedTasks.slice(0, 5).map((t, j) => {
                            const st = (t.status || "").toUpperCase();
                            const stCol = st === "BLOCKED" ? RED : st === "DONE" ? GRN : AMB;
                            return (
                              <div key={j} style={{ fontSize: 10, color: "#AABBCC", padding: "2px 0" }}>
                                <span style={{ color: AMB }}>⬡ </span>
                                {t.title || t.name || "Task"}
                                {st && <span style={{ color: stCol }}> [{st}]</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {cls === "blind" && (
                        <div style={{ fontSize: 10, color: RED }}>
                          ⚠ No scenario or task coverage — intelligence gap.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? DIM : AMB, color: "#000",
              border: "none", borderRadius: 5, padding: "5px 14px",
              fontSize: 10, cursor: assessing ? "not-allowed" : "pointer",
              fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, fontWeight: 700,
            }}>
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            {assessment && (
              <div style={{ fontSize: 10, color: "#AABBCC", flex: 1, lineHeight: 1.5 }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
