/**
 * F184 Brain × Dataset × Skill × Investigation × Task
 * Operational Intelligence Depth Coverage — ◈ BDSITK
 *
 * Fetches: /v1/cinematic/brain + /v1/datasets + /v1/aip/skill
 *          + /v1/investigations + /entities/Task
 * Classifies each brain node by keyword overlap across all 4 external sources:
 *   GROUNDED  — matched all 4 (dataset + skill + investigation + task)
 *   EQUIPPED  — matched dataset + skill but missing investigation/task
 *   ACTIVE    — matched investigation + task but missing dataset/skill
 *   BLIND     — zero matches (no dataset, no skill, no investigation, no task)
 * Red pulse on BLIND count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */

import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CYAN  = "#29E7FF";
const GREEN = "#00FF88";
const AMBER = "#FFB347";
const RED   = "#FF3B6B";

const CLS_COLOR = { GROUNDED: GREEN, EQUIPPED: CYAN, ACTIVE: AMBER, BLIND: "#6a7a8a" };
const CLS_ORDER = { GROUNDED: 4, EQUIPPED: 3, ACTIVE: 2, BLIND: 1 };

const BDSITK_RE = /\b(bdsitk|brain\.dataset\.skill|brain\.operational\.depth|operational\.intelligence\.depth|brain\.task\.skill|brain\.investigation\.depth|brain\.grounded|brain\.blind\.spot|brain\.coverage\.depth|brain\.skill\.investigation|brain\.dataset\.task|intelligence\.depth\.coverage)\b/i;

export function isBdsitkQuery(q) { return BDSITK_RE.test(q || ""); }

export function buildBdsitkScript(rows) {
  const total    = rows.length;
  const grounded = rows.filter(r => r.cls === "GROUNDED").length;
  const blind    = rows.filter(r => r.cls === "BLIND").length;
  return (
    `Brain Operational Intelligence Depth Coverage: ${total} brain node${total !== 1 ? "s" : ""} assessed across datasets, skills, investigations, and tasks. ` +
    `${grounded} fully grounded (dataset + skill + investigation + task coverage across all 4 dimensions). ` +
    (blind > 0
      ? `${blind} BLIND — no dataset backing, no skill coverage, no investigation, no task assignment. These brain nodes are operational dead zones — immediate grounding required to restore intelligence depth.`
      : "No blind brain nodes detected. All nodes have at least one operational intelligence anchor.")
  );
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const bToks = new Set(tokens(bStr));
  return aToks.some(t => bToks.has(t));
}

function normalizeArray(raw, keys) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.data)    ? raw.data
    : Array.isArray(raw?.items)   ? raw.items
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.nodes)   ? raw.nodes
    : [];
  return arr.map(item => {
    let label = "";
    for (const k of keys) if (item[k]) { label = String(item[k]); break; }
    return { ...item, _label: label };
  });
}

async function fetcher(path) {
  try {
    const r = await fetch(`${apiBase()}${path}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    return r.ok ? r.json() : [];
  } catch { return []; }
}

function classify(hasDataset, hasSkill, hasInvestigation, hasTask) {
  if (hasDataset && hasSkill && hasInvestigation && hasTask) return "GROUNDED";
  if (hasDataset && hasSkill) return "EQUIPPED";
  if (hasInvestigation && hasTask) return "ACTIVE";
  return "BLIND";
}

async function loadData() {
  const [brainRaw, datasetsRaw, skillsRaw, investigationsRaw, tasksRaw] = await Promise.all([
    fetcher("/v1/cinematic/brain"),
    fetcher("/v1/datasets"),
    fetcher("/v1/aip/skill"),
    fetcher("/v1/investigations"),
    fetcher("/entities/Task"),
  ]);

  const brain         = normalizeArray(brainRaw,         ["label", "name", "node_id", "entity", "id"]);
  const datasets      = normalizeArray(datasetsRaw,      ["name", "title", "dataset_name", "label", "id"]);
  const skills        = normalizeArray(skillsRaw,        ["name", "skill_name", "title", "label", "id"]);
  const investigations = normalizeArray(investigationsRaw, ["title", "name", "case_name", "subject", "label", "id"]);
  const tasks         = normalizeArray(tasksRaw,         ["title", "name", "task_name", "subject", "label", "id"]);

  return brain.map(node => {
    const nToks = tokens(
      node._label + " " +
      (node.type || "") + " " +
      (node.category || "") + " " +
      (node.description || "") + " " +
      (node.tags || "").toString()
    );

    const matchedDatasets = datasets.filter(d => overlaps(nToks,
      d._label + " " + (d.description || "") + " " + (d.category || "") + " " + (d.type || "")
    ));
    const matchedSkills = skills.filter(s => overlaps(nToks,
      s._label + " " + (s.description || "") + " " + (s.category || "") + " " + (s.domain || "")
    ));
    const matchedInvestigations = investigations.filter(inv => overlaps(nToks,
      inv._label + " " + (inv.description || "") + " " + (inv.status || "") + " " + (inv.category || "")
    ));
    const matchedTasks = tasks.filter(t => overlaps(nToks,
      t._label + " " + (t.description || "") + " " + (t.status || "") + " " + (t.assigned_to || "")
    ));

    return {
      ...node,
      cls: classify(
        matchedDatasets.length > 0,
        matchedSkills.length > 0,
        matchedInvestigations.length > 0,
        matchedTasks.length > 0
      ),
      matchedDatasets,
      matchedSkills,
      matchedInvestigations,
      matchedTasks,
    };
  }).sort((a, b) => CLS_ORDER[b.cls] - CLS_ORDER[a.cls]);
}

const FILTERS = ["ALL", "GROUNDED", "EQUIPPED", "ACTIVE", "BLIND"];
const LEFT_PX = 151400;
const Z_IDX   = 281;

export default function BrainDatasetSkillInvestigationTaskDepth() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const load = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch < 90_000) return;
    setLoading(true);
    try {
      const data = await loadData();
      setRows(data);
      setLastFetch(Date.now());
    } finally {
      setLoading(false);
    }
  }, [lastFetch]);

  useEffect(() => {
    const handler = () => { setOpen(v => { if (!v) load(true); return !v; }); };
    window.addEventListener("jarvis:bdsitk-toggle", handler);
    return () => window.removeEventListener("jarvis:bdsitk-toggle", handler);
  }, [load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => load(true), 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildBdsitkScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      if (r.ok) {
        const j = await r.json();
        const reply = j.response || j.message || j.reply || script;
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: reply }),
        });
      }
    } finally {
      setAssessing(false);
    }
  }, [assessing, rows]);

  const counts = {
    GROUNDED:  rows.filter(r => r.cls === "GROUNDED").length,
    EQUIPPED:  rows.filter(r => r.cls === "EQUIPPED").length,
    ACTIVE:    rows.filter(r => r.cls === "ACTIVE").length,
    BLIND:     rows.filter(r => r.cls === "BLIND").length,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r._label || "").toLowerCase().includes(s) ||
             (r.type || "").toLowerCase().includes(s) ||
             (r.category || "").toLowerCase().includes(s);
    }
    return true;
  });

  const hasBlind = counts.BLIND > 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(v => { if (!v) load(true); return !v; }); }}
        style={{
          position: "fixed",
          bottom: 8,
          left: LEFT_PX,
          zIndex: Z_IDX,
          background: open ? `${RED}22` : "#0a1628cc",
          border: `1px solid ${hasBlind ? RED : CYAN}55`,
          borderRadius: 7,
          color: hasBlind ? RED : CYAN,
          cursor: "pointer",
          padding: "5px 10px",
          fontSize: 9,
          letterSpacing: 1,
          fontWeight: 700,
          fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 5,
          animation: hasBlind ? "bdsitk_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        {hasBlind && (
          <span style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: RED,
            animation: "bdsitk_dot_pulse 1.2s ease-in-out infinite",
          }} />
        )}
        ◈ BDSITK
        {hasBlind && (
          <span style={{
            background: `${RED}33`,
            border: `1px solid ${RED}66`,
            borderRadius: 4,
            padding: "1px 5px",
            fontSize: 8,
          }}>
            {counts.BLIND} BLIND
          </span>
        )}
      </button>

      <style>{`
        @keyframes bdsitk_pulse_btn {
          0%,100% { box-shadow: 0 0 0 0 ${RED}44; }
          50%      { box-shadow: 0 0 12px 3px ${RED}44; }
        }
        @keyframes bdsitk_dot_pulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
      `}</style>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 40,
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(1100px, 96vw)",
          maxHeight: "78vh",
          zIndex: Z_IDX + 1,
          background: "linear-gradient(145deg,#040d1aee,#071426ee)",
          border: `1px solid ${hasBlind ? RED : CYAN}33`,
          borderRadius: 14,
          boxShadow: `0 0 40px ${hasBlind ? RED : CYAN}22`,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px 10px",
            borderBottom: "1px solid #ffffff11",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}>
            <span style={{ color: CYAN, fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>
              ◈ BRAIN OPERATIONAL INTELLIGENCE DEPTH COVERAGE
            </span>
            <span style={{ color: "#566878", fontSize: 9 }}>
              BRAIN × DATASET × SKILL × INVESTIGATION × TASK
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {Object.entries(counts).map(([k, v]) => (
                <span key={k} style={{
                  background: `${CLS_COLOR[k]}15`,
                  border: `1px solid ${CLS_COLOR[k]}44`,
                  borderRadius: 5,
                  color: CLS_COLOR[k],
                  fontSize: 9,
                  padding: "2px 8px",
                  fontWeight: 700,
                }}>
                  {k} {v}
                </span>
              ))}
              <button
                onClick={assess}
                disabled={assessing || rows.length === 0}
                style={{
                  background: assessing ? "#1a2a3a" : `${GREEN}22`,
                  border: `1px solid ${GREEN}55`,
                  borderRadius: 6,
                  color: GREEN,
                  cursor: assessing ? "not-allowed" : "pointer",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "4px 10px",
                  letterSpacing: 1,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {assessing ? "ASSESSING…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "1px solid #ffffff22",
                  borderRadius: 5,
                  color: "#566878",
                  cursor: "pointer",
                  fontSize: 10,
                  padding: "3px 8px",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Filters + search */}
          <div style={{
            padding: "8px 18px",
            borderBottom: "1px solid #ffffff0a",
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}>
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${f === "ALL" ? CYAN : CLS_COLOR[f]}22` : "none",
                  border: `1px solid ${filter === f ? (f === "ALL" ? CYAN : CLS_COLOR[f]) : "#ffffff22"}`,
                  borderRadius: 5,
                  color: filter === f ? (f === "ALL" ? CYAN : CLS_COLOR[f]) : "#566878",
                  cursor: "pointer",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "3px 9px",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {f}{f !== "ALL" ? ` (${counts[f] || 0})` : ""}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search brain nodes…"
              style={{
                marginLeft: "auto",
                background: "#071426",
                border: "1px solid #ffffff22",
                borderRadius: 5,
                color: CYAN,
                fontSize: 9,
                padding: "4px 10px",
                fontFamily: "'JetBrains Mono',monospace",
                outline: "none",
                width: 180,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
            {loading && (
              <div style={{ color: CYAN, fontSize: 10, padding: "20px", textAlign: "center" }}>
                LOADING BRAIN INTELLIGENCE DEPTH DATA…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: "#566878", fontSize: 10, padding: "20px", textAlign: "center" }}>
                No brain nodes match current filter.
              </div>
            )}
            {!loading && visible.map((row, i) => {
              const isExp = expanded === i;
              const clsColor = CLS_COLOR[row.cls];
              return (
                <div
                  key={i}
                  style={{ borderBottom: "1px solid #ffffff08", padding: "0 18px" }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 0",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      minWidth: 90,
                      background: `${clsColor}18`,
                      border: `1px solid ${clsColor}44`,
                      borderRadius: 4,
                      color: clsColor,
                      fontSize: 8,
                      fontWeight: 700,
                      padding: "2px 7px",
                      letterSpacing: 1,
                      textAlign: "center",
                    }}>
                      {row.cls}
                    </span>
                    <span style={{ color: "#c8d8e8", fontSize: 10, flex: 1 }}>
                      {row._label || row.id || "—"}
                    </span>
                    {row.type && (
                      <span style={{
                        background: `${AMBER}18`,
                        border: `1px solid ${AMBER}44`,
                        borderRadius: 3,
                        color: AMBER,
                        fontSize: 8,
                        padding: "1px 5px",
                        fontWeight: 600,
                      }}>
                        {row.type}
                      </span>
                    )}
                    {row.centrality !== undefined && (
                      <span style={{
                        background: `${CYAN}18`,
                        border: `1px solid ${CYAN}44`,
                        borderRadius: 3,
                        color: CYAN,
                        fontSize: 8,
                        padding: "1px 5px",
                        fontWeight: 600,
                      }}>
                        {typeof row.centrality === "number" ? row.centrality.toFixed(3) : row.centrality}
                      </span>
                    )}
                    <span style={{ color: "#2a3a4a", fontSize: 9, marginLeft: 4 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{
                      padding: "0 0 12px 12px",
                      borderLeft: `2px solid ${clsColor}33`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}>
                      <DetailSection
                        label="DATASETS" color={CYAN}
                        items={row.matchedDatasets}
                        renderItem={d => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{d._label}</span>
                            {d.row_count !== undefined && (
                              <Badge color={CYAN}>{d.row_count} rows</Badge>
                            )}
                          </>
                        )}
                      />
                      <DetailSection
                        label="SKILLS" color={GREEN}
                        items={row.matchedSkills}
                        renderItem={s => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{s._label}</span>
                            {s.score !== undefined && (
                              <Badge color={GREEN}>{typeof s.score === "number" ? s.score.toFixed(2) : s.score}</Badge>
                            )}
                          </>
                        )}
                      />
                      <DetailSection
                        label="INVESTIGATIONS" color={AMBER}
                        items={row.matchedInvestigations}
                        renderItem={inv => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{inv._label}</span>
                            {inv.status && (
                              <Badge color={inv.status === "closed" || inv.status === "resolved" ? GREEN : AMBER}>
                                {inv.status}
                              </Badge>
                            )}
                          </>
                        )}
                      />
                      <DetailSection
                        label="TASKS" color={RED}
                        items={row.matchedTasks}
                        renderItem={t => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{t._label}</span>
                            {t.status && (
                              <Badge color={t.status === "complete" || t.status === "done" ? GREEN : AMBER}>
                                {t.status}
                              </Badge>
                            )}
                          </>
                        )}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 18px",
            borderTop: "1px solid #ffffff0a",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}>
            <span style={{ color: "#566878", fontSize: 8 }}>
              {rows.length} brain nodes · auto-refresh 90s
            </span>
            {loading && <span style={{ color: CYAN, fontSize: 8 }}>LOADING…</span>}
            <button
              onClick={() => load(true)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: `1px solid ${CYAN}33`,
                borderRadius: 4,
                color: CYAN,
                cursor: "pointer",
                fontSize: 8,
                padding: "2px 8px",
                fontFamily: "'JetBrains Mono',monospace",
              }}
            >
              ↺ REFRESH
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function DetailSection({ label, color, items, renderItem }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div style={{ color, fontSize: 8, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
        {label} ({items.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {items.slice(0, 6).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {renderItem(item)}
          </div>
        ))}
        {items.length > 6 && (
          <span style={{ color: "#566878", fontSize: 8 }}>+{items.length - 6} more</span>
        )}
      </div>
    </div>
  );
}

function Badge({ color, children }) {
  return (
    <span style={{
      background: `${color}18`,
      border: `1px solid ${color}44`,
      borderRadius: 3,
      color,
      fontSize: 8,
      padding: "1px 5px",
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}
