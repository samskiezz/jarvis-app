/**
 * ScenarioPlaybookViewer — F314.
 *
 * Data sources (confirmed-real):
 *   GET  /v1/scenario/list          → [{id, name/title, status, description, steps, conditions,
 *                                       expected_outcomes, kind, ...}, ...]
 *   POST /v1/jarvis/agent/chat      → {answer} ASSESS AI analysis of scenario feasibility
 *   POST /v1/voice/tts              → speak result
 *
 * NOTE: /v1/ontology/objects (linked entities) is NOT in the confirmed-real list.
 * That sub-feature is omitted per backlog rules.
 *
 * Displays:
 *   - Scenario list: status badge (ACTIVE/PENDING/ARCHIVED) + kind chip + name + description
 *   - Click row → full detail inspector: title, description, steps (numbered),
 *     conditions, expected outcomes
 *   - "Run Scenario" → POST /v1/jarvis/agent/chat with scenario context → AI feasibility analysis
 *   - ASSESS button → agent summary of all scenarios + TTS
 *
 * Toggle: ◈ SCNPBOOK  left:223640  bottom:8  zIndex:410
 * Event:  jarvis:scnpbook-toggle
 * Voice:  "scenario playbook / scnpbook / playbook viewer / scenario detail /
 *          scenario inspector / run scenario / scenario list / scenario viewer"
 *
 * Exported for JarvisBrain: isScnpbookQuery, buildScnpbookScript
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ── palette ────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const VI   = "#A78BFA";
const SURF = "rgba(6,11,18,0.97)";
const BORD = "rgba(41,231,255,0.18)";
const DIM  = "rgba(41,231,255,0.40)";

// ── constants ─────────────────────────────────────────────────────────────
const BTN_LEFT = 223640;
const PANEL_W  = 900;
const PANEL_H  = 640;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ── JarvisBrain exports ───────────────────────────────────────────────────
const SCNPBOOK_RE =
  /\b(scenario\s*playbook|scnpbook\b|playbook\s*viewer|scenario\s*detail|scenario\s*inspector|run\s*scenario|scenario\s*list|scenario\s*viewer|scenario\s*overview|active\s*scenarios?|playbook\s*browser)\b/i;

export function isScnpbookQuery(q) {
  return SCNPBOOK_RE.test(q || "");
}

export async function buildScnpbookScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/scenario/list`);
    const d = await r.json();
    const items = normalise(d);
    const total = items.length;
    const active = items.filter(s => statusOf(s) === "ACTIVE").length;
    const latest = items[0];
    return (
      `Scenario Playbook: ${total} scenario(s) total — ${active} ACTIVE. ` +
      (latest
        ? `Latest: "${nameOf(latest)}" (${statusOf(latest)}).`
        : "No scenarios loaded.")
    );
  } catch {
    return "Scenario Playbook: could not reach /v1/scenario/list.";
  }
}

// ── helpers ───────────────────────────────────────────────────────────────
function normalise(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["scenarios", "items", "results", "data"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function nameOf(s) {
  return s?.name || s?.title || s?.scenario_name || "Unnamed Scenario";
}

function statusOf(s) {
  const v = (s?.status || s?.state || "UNKNOWN").toString().toUpperCase();
  if (v.includes("ACTIVE") || v.includes("RUNNING")) return "ACTIVE";
  if (v.includes("PENDING") || v.includes("PLANNED") || v.includes("DRAFT")) return "PENDING";
  if (v.includes("ARCHIVED") || v.includes("DONE") || v.includes("COMPLETE")) return "ARCHIVED";
  return v || "UNKNOWN";
}

function kindOf(s) {
  return (s?.kind || s?.type || s?.category || "SIM").toString().toUpperCase();
}

function stepsOf(s) {
  if (Array.isArray(s?.steps)) return s.steps;
  if (Array.isArray(s?.step_list)) return s.step_list;
  if (typeof s?.steps === "string") return s.steps.split(/\n|;\s*/).filter(Boolean);
  return [];
}

function conditionsOf(s) {
  if (Array.isArray(s?.conditions)) return s.conditions;
  if (typeof s?.conditions === "string") return s.conditions.split(/\n|;\s*/).filter(Boolean);
  return [];
}

function outcomesOf(s) {
  if (Array.isArray(s?.expected_outcomes)) return s.expected_outcomes;
  if (typeof s?.expected_outcomes === "string") return s.expected_outcomes.split(/\n|;\s*/).filter(Boolean);
  if (Array.isArray(s?.outcomes)) return s.outcomes;
  return [];
}

function statusColor(status) {
  if (status === "ACTIVE")   return GN;
  if (status === "PENDING")  return AM;
  if (status === "ARCHIVED") return DIM;
  return CY;
}

function badge(label, color) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 3,
      border: `1px solid ${color}55`, background: `${color}18`,
      color, fontSize: 9, letterSpacing: 1, marginRight: 5, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

// ── TTS helper ────────────────────────────────────────────────────────────
async function tts(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return;
    const buf = await r.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createBufferSource();
    src.buffer = await ctx.decodeAudioData(buf);
    src.connect(ctx.destination);
    src.start();
  } catch {}
}

// ── main component ────────────────────────────────────────────────────────
export default function ScenarioPlaybookViewer() {
  const [open, setOpen]         = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const [running, setRunning]   = useState(false);
  const [runResult, setRunResult] = useState("");
  const panelRef = useRef(null);

  // ── fetch scenarios ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`${apiBase()}/v1/scenario/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setScenarios(normalise(d));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // ── toggle listener ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setOpen(prev => !prev);
    window.addEventListener("jarvis:scnpbook-toggle", handler);
    return () => window.removeEventListener("jarvis:scnpbook-toggle", handler);
  }, []);

  // ── ASSESS all scenarios ─────────────────────────────────────────────────
  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment("");
    const summary = scenarios
      .slice(0, 8)
      .map(s => `${nameOf(s)} (${statusOf(s)})`)
      .join(", ");
    const prompt = `Scenario Playbook has ${scenarios.length} scenario(s): ${summary}. Briefly assess the coverage, readiness, and any gaps in 2 sentences.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || "Assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(txt);
      tts(txt);
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [scenarios]);

  // ── Run Scenario (AI feasibility analysis) ───────────────────────────────
  const runScenario = useCallback(async (s) => {
    if (!s) return;
    setRunning(true);
    setRunResult("");
    const steps = stepsOf(s);
    const conditions = conditionsOf(s);
    const outcomes = outcomesOf(s);
    const prompt =
      `Run feasibility analysis for scenario: "${nameOf(s)}". ` +
      `Status: ${statusOf(s)}. Kind: ${kindOf(s)}. ` +
      (s.description ? `Description: ${s.description}. ` : "") +
      (steps.length ? `Steps: ${steps.slice(0, 5).join("; ")}. ` : "") +
      (conditions.length ? `Conditions: ${conditions.slice(0, 3).join("; ")}. ` : "") +
      (outcomes.length ? `Expected outcomes: ${outcomes.slice(0, 3).join("; ")}. ` : "") +
      "Is this scenario feasible given current JARVIS data? Assess in 2-3 sentences.";
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || "Analysis unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setRunResult(txt);
      tts(txt);
    } catch {
      setRunResult("Analysis unavailable.");
    } finally {
      setRunning(false);
    }
  }, []);

  // ── filtered list ─────────────────────────────────────────────────────────
  const filtered = scenarios.filter(s => {
    const st = statusOf(s);
    if (filter === "ACTIVE"   && st !== "ACTIVE")   return false;
    if (filter === "PENDING"  && st !== "PENDING")  return false;
    if (filter === "ARCHIVED" && st !== "ARCHIVED") return false;
    if (search) {
      const hay = `${nameOf(s)} ${s.description || ""} ${kindOf(s)}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario Playbook Viewer"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 410,
          background: "rgba(6,11,18,0.85)", border: `1px solid ${BORD}`,
          color: CY, fontFamily: "monospace", fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ SCNPBOOK
      </button>
    );
  }

  const selStatus = selected ? statusOf(selected) : null;
  const selSteps = selected ? stepsOf(selected) : [];
  const selConditions = selected ? conditionsOf(selected) : [];
  const selOutcomes = selected ? outcomesOf(selected) : [];

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed", bottom: 40, left: BTN_LEFT - 200,
        width: PANEL_W, height: PANEL_H,
        background: SURF, border: `1px solid ${BORD}`,
        borderRadius: 6, zIndex: 410, display: "flex", flexDirection: "column",
        fontFamily: "monospace", overflow: "hidden",
        boxShadow: `0 0 40px rgba(41,231,255,0.08)`,
      }}
    >
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${BORD}`,
        background: "rgba(41,231,255,0.04)",
      }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
          ◈ SCENARIO PLAYBOOK VIEWER
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={load} title="Refresh" style={btnStyle(CY)}>↻</button>
          <button
            onClick={assess}
            disabled={assessing || scenarios.length === 0}
            style={btnStyle(VI)}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button onClick={() => setOpen(false)} style={btnStyle(RD)}>✕</button>
        </div>
      </div>

      {/* stat bar */}
      <div style={{
        display: "flex", gap: 12, padding: "5px 12px",
        borderBottom: `1px solid ${BORD}20`, fontSize: 9,
      }}>
        {[
          ["TOTAL", scenarios.length, CY],
          ["ACTIVE", scenarios.filter(s => statusOf(s) === "ACTIVE").length, GN],
          ["PENDING", scenarios.filter(s => statusOf(s) === "PENDING").length, AM],
          ["ARCHIVED", scenarios.filter(s => statusOf(s) === "ARCHIVED").length, DIM],
        ].map(([label, val, color]) => (
          <span key={label} style={{ color, letterSpacing: 1 }}>
            {label}: <b>{val}</b>
          </span>
        ))}
      </div>

      {/* filter + search */}
      <div style={{
        display: "flex", gap: 6, padding: "5px 12px",
        borderBottom: `1px solid ${BORD}20`, alignItems: "center",
      }}>
        {["ALL", "ACTIVE", "PENDING", "ARCHIVED"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...btnStyle(filter === f ? CY : DIM),
              background: filter === f ? "rgba(41,231,255,0.12)" : "transparent",
              fontSize: 8, padding: "2px 6px",
            }}
          >
            {f}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${BORD}`,
            color: CY, fontFamily: "monospace", fontSize: 9, padding: "3px 7px",
            borderRadius: 3, outline: "none", flex: 1,
          }}
        />
      </div>

      {/* main area */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* left: scenario list */}
        <div style={{
          width: 320, borderRight: `1px solid ${BORD}`,
          overflowY: "auto", padding: "6px 0",
        }}>
          {loading && (
            <div style={{ color: DIM, fontSize: 9, padding: "12px 12px" }}>Loading…</div>
          )}
          {err && (
            <div style={{ color: RD, fontSize: 9, padding: "12px 12px" }}>{err}</div>
          )}
          {!loading && !err && filtered.length === 0 && (
            <div style={{ color: DIM, fontSize: 9, padding: "12px 12px" }}>No scenarios.</div>
          )}
          {filtered.map(s => {
            const st = statusOf(s);
            const sc = statusColor(st);
            const isSelected = selected?.id === s?.id;
            return (
              <div
                key={s.id || nameOf(s)}
                onClick={() => { setSelected(s); setRunResult(""); }}
                style={{
                  padding: "7px 12px", cursor: "pointer",
                  background: isSelected ? "rgba(41,231,255,0.08)" : "transparent",
                  borderLeft: isSelected ? `2px solid ${CY}` : "2px solid transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                  {badge(st, sc)}
                  {badge(kindOf(s), VI)}
                </div>
                <div style={{ color: CY, fontSize: 10, marginBottom: 2 }}>{nameOf(s)}</div>
                {s.description && (
                  <div style={{
                    color: DIM, fontSize: 8,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {s.description}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* right: detail inspector */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {!selected && (
            <div style={{ color: DIM, fontSize: 9, marginTop: 20 }}>
              Select a scenario to view the playbook.
            </div>
          )}
          {selected && (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ color: CY, fontSize: 12, fontWeight: "bold", marginBottom: 4 }}>
                    {nameOf(selected)}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {badge(selStatus, statusColor(selStatus))}
                    {badge(kindOf(selected), VI)}
                  </div>
                </div>
                <button
                  onClick={() => runScenario(selected)}
                  disabled={running}
                  style={{
                    ...btnStyle(GN),
                    fontSize: 9, padding: "4px 10px",
                    background: running ? "rgba(74,222,128,0.08)" : "rgba(74,222,128,0.15)",
                  }}
                >
                  {running ? "Analysing…" : "▶ Run Scenario"}
                </button>
              </div>

              {selected.description && (
                <section>
                  <SectionHeader label="Description" />
                  <p style={{ color: "#aab8c8", fontSize: 9, margin: 0, lineHeight: 1.6 }}>
                    {selected.description}
                  </p>
                </section>
              )}

              {selSteps.length > 0 && (
                <section>
                  <SectionHeader label={`Steps (${selSteps.length})`} />
                  <ol style={{ margin: 0, paddingLeft: 18, color: "#aab8c8", fontSize: 9, lineHeight: 1.8 }}>
                    {selSteps.map((step, i) => (
                      <li key={i}>{typeof step === "object" ? JSON.stringify(step) : step}</li>
                    ))}
                  </ol>
                </section>
              )}

              {selConditions.length > 0 && (
                <section>
                  <SectionHeader label={`Conditions (${selConditions.length})`} />
                  <ul style={{ margin: 0, paddingLeft: 14, color: "#aab8c8", fontSize: 9, lineHeight: 1.8 }}>
                    {selConditions.map((c, i) => (
                      <li key={i}>{typeof c === "object" ? JSON.stringify(c) : c}</li>
                    ))}
                  </ul>
                </section>
              )}

              {selOutcomes.length > 0 && (
                <section>
                  <SectionHeader label={`Expected Outcomes (${selOutcomes.length})`} />
                  <ul style={{ margin: 0, paddingLeft: 14, color: GN + "cc", fontSize: 9, lineHeight: 1.8 }}>
                    {selOutcomes.map((o, i) => (
                      <li key={i}>{typeof o === "object" ? JSON.stringify(o) : o}</li>
                    ))}
                  </ul>
                </section>
              )}

              {(selSteps.length === 0 && selConditions.length === 0 && selOutcomes.length === 0 && !selected.description) && (
                <div style={{ color: DIM, fontSize: 9 }}>No detail fields returned for this scenario.</div>
              )}

              {/* Run Scenario result */}
              {(running || runResult) && (
                <section>
                  <SectionHeader label="AI Feasibility Analysis" color={GN} />
                  <p style={{
                    color: running ? DIM : "#aab8c8",
                    fontSize: 9, margin: 0, lineHeight: 1.6,
                    fontStyle: running ? "italic" : "normal",
                  }}>
                    {running ? "JARVIS analysing feasibility…" : runResult}
                  </p>
                </section>
              )}
            </>
          )}

          {/* ASSESS result */}
          {(assessing || assessment) && (
            <section style={{ marginTop: "auto", paddingTop: 10, borderTop: `1px solid ${BORD}` }}>
              <SectionHeader label="ASSESS" color={VI} />
              <p style={{
                color: assessing ? DIM : "#aab8c8",
                fontSize: 9, margin: 0, lineHeight: 1.6,
                fontStyle: assessing ? "italic" : "normal",
              }}>
                {assessing ? "JARVIS assessing scenarios…" : assessment}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ── tiny helpers ──────────────────────────────────────────────────────────
function SectionHeader({ label, color = CY }) {
  return (
    <div style={{
      color, fontSize: 8, letterSpacing: 1.5, marginBottom: 4,
      borderBottom: `1px solid rgba(41,231,255,0.12)`, paddingBottom: 2,
    }}>
      {label.toUpperCase()}
    </div>
  );
}

function btnStyle(color) {
  return {
    background: "transparent", border: `1px solid ${color}55`,
    color, fontFamily: "monospace", fontSize: 9, letterSpacing: 1,
    padding: "2px 7px", borderRadius: 3, cursor: "pointer",
  };
}
