/**
 * DatasetScenarioCoverage — F75.
 *
 * Parallel-fetches /v1/datasets + /v1/scenario/list.
 * Keyword-correlates each scenario (name/objective/description/type)
 * against the dataset catalog (name/description/type/tags) to surface:
 *   DATA-BACKED  — scenarios with at least one matching dataset
 *   DATA-DARK    — scenarios with no dataset coverage (blind execution risk)
 *
 * Stat tiles: scenarios / datasets / backed / data-dark
 * Filter tabs: ALL / BACKED / DATA-DARK + text search
 * Expand scenario → matched datasets with relevance score + type badge.
 * Amber badge on data-dark count.
 * Click ▶ ASSESS on any scenario → /v1/jarvis/agent/chat AI
 *   2-sentence data-readiness brief + TTS via jarvis:speak-dossier.
 * 120-s auto-refresh.
 *
 * Intent: "dataset scenario" / "scenario data coverage" /
 *         "data-backed scenarios" / "which scenarios have data" /
 *         "data dark" / "dscen"
 *   → jarvis:dscen-toggle + TTS brief via buildDscenScript()
 *
 * Toggle: ◈ DSCEN at left:18300, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const PURPLE = "#A78BFA";
const BTN_LEFT = 18300;
const REFRESH_MS = 120 * 1000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseScenarios(raw) {
  return normaliseArray(raw).map((s) => ({
    id: s.id || s.scenario_id || String(Math.random()),
    name: s.name || s.title || s.scenario_name || "Unnamed Scenario",
    objective: s.objective || s.description || s.goal || s.summary || "",
    type: s.type || s.category || s.scenario_type || "",
    status: (s.status || "pending").toLowerCase(),
    priority: s.priority || "",
  }));
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((d) => ({
    id: d.id || d.dataset_id || String(Math.random()),
    name: d.name || d.title || d.dataset_name || "Untitled Dataset",
    description: d.description || d.summary || d.abstract || "",
    type: d.type || d.category || d.dataset_type || "",
    tags: [...(d.tags || []), ...(d.keywords || [])].map(String),
    row_count: d.row_count || d.rows || d.record_count || null,
  }));
}

function keywords(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function datasetMatchScore(dataset, scenario) {
  const scenText =
    `${scenario.name} ${scenario.objective} ${scenario.type}`.toLowerCase();
  const dsWords = [
    ...keywords(dataset.name),
    ...keywords(dataset.description),
    ...keywords(dataset.type),
    ...dataset.tags.flatMap(keywords),
  ];
  return dsWords.reduce(
    (acc, w) => acc + (scenText.includes(w) ? 1 : 0),
    0
  );
}

function correlate(scenarios, datasets) {
  return scenarios.map((sc) => {
    const matched = datasets
      .map((d) => ({ ...d, _score: datasetMatchScore(d, sc) }))
      .filter((d) => d._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...sc, matched };
  });
}

function statusColor(status) {
  if (status === "running") return GREEN;
  if (status === "failed") return "#FF3D5A";
  if (status === "pending") return AMBER;
  if (status === "completed") return PURPLE;
  return "#445566";
}

// ─── exported intent helpers (consumed by JarvisBrain) ──────────────────────

const DSCEN_RE =
  /dataset.{0,20}scen|scen.{0,20}dataset|data.{0,10}backed\s+scen|data.?dark|which\s+scen.{0,10}data|scen.{0,10}data\s+cover|dscen\b/i;

export function isDscenQuery(q) {
  return DSCEN_RE.test(q || "");
}

export async function buildDscenScript() {
  try {
    const [dsRaw, scenRaw] = await Promise.all([
      fetch(`${apiBase()}/v1/datasets`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/scenario/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const datasets = normaliseDatasets(dsRaw);
    const scenarios = normaliseScenarios(scenRaw);
    const correlated = correlate(scenarios, datasets);
    const backed = correlated.filter((sc) => sc.matched.length > 0);
    const dark = correlated.filter((sc) => sc.matched.length === 0);
    return `Dataset-scenario coverage analysis complete, sir. ${datasets.length} dataset${datasets.length !== 1 ? "s" : ""} cross-referenced against ${scenarios.length} scenario${scenarios.length !== 1 ? "s" : ""}. ${backed.length} scenario${backed.length !== 1 ? "s are" : " is"} data-backed with confirmed dataset coverage. ${dark.length} scenario${dark.length !== 1 ? "s operate" : " operates"} data-dark — no supporting datasets found${dark.length > 0 ? ", presenting blind execution risk" : ""}. Select a scenario to review its data coverage.`;
  } catch (_) {
    return "Dataset-scenario coverage advisor is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DatasetScenarioCoverage() {
  const [visible, setVisible] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("DATA-DARK");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [dsRaw, scenRaw] = await Promise.all([
        fetch(`${apiBase()}/v1/datasets`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/scenario/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setDatasets(normaliseDatasets(dsRaw));
      setScenarios(normaliseScenarios(scenRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:dscen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dscen-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) {
      clearInterval(pollRef.current);
      return;
    }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessScenario(sc) {
    setAssessing(sc.id);
    const dsList =
      sc.matched.length > 0
        ? sc.matched
            .map((d) => `"${d.name}"${d.type ? ` (${d.type})` : ""}`)
            .join(", ")
        : "none";
    const prompt = `As JARVIS, provide a 2-sentence data-readiness assessment for the scenario "${sc.name}"${sc.objective ? ` (objective: ${sc.objective.slice(0, 100)})` : ""}. ${sc.matched.length > 0 ? `Matched datasets: ${dsList}. Assess how well these datasets support the scenario's data requirements.` : "This scenario has no matched datasets in the system. Assess the data gap and recommend what datasets should be acquired or created to support this scenario."}`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data available for scenario readiness assessment, sir.";
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
      );
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Assessment unavailable at this time, sir." },
        })
      );
    }
    setAssessing(null);
  }

  const correlated = correlate(scenarios, datasets);
  const backed = correlated.filter((sc) => sc.matched.length > 0);
  const dark = correlated.filter((sc) => sc.matched.length === 0);

  const baseList =
    tab === "BACKED"
      ? backed
      : tab === "DATA-DARK"
      ? dark
      : correlated;

  const displayed = search
    ? baseList.filter((sc) =>
        `${sc.name} ${sc.objective} ${sc.type}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : baseList;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Dataset-Scenario Coverage (F75)"
        style={{
          position: "fixed",
          bottom: 6,
          left: BTN_LEFT,
          zIndex: 65,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : CY}44`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4,
          padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 8,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ DSCEN
        {dark.length > 0 && (
          <span
            style={{
              marginLeft: 4,
              background: AMBER,
              color: "#04060A",
              borderRadius: 3,
              padding: "0 4px",
              fontSize: 7,
              fontWeight: "bold",
            }}
          >
            {dark.length}
          </span>
        )}
      </button>

      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            left: BTN_LEFT - 280,
            zIndex: 65,
            width: 560,
            maxHeight: "70vh",
            overflowY: "auto",
            background: "rgba(6,11,18,0.93)",
            border: `1px solid ${CY}44`,
            borderRadius: 10,
            padding: "14px 16px",
            fontFamily: "'JetBrains Mono',monospace",
            color: "#DCEBF5",
            backdropFilter: "blur(12px)",
            boxShadow: `0 0 60px ${CY}18`,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ DATASET-SCENARIO COVERAGE
            </span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: `1px solid ${CY}33`,
                borderRadius: 3,
                color: `${CY}88`,
                padding: "2px 6px",
                fontSize: 7,
                cursor: "pointer",
                letterSpacing: 1,
              }}
            >
              ↻ REFRESH
            </button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#445566",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: 6,
              marginBottom: 10,
            }}
          >
            {[
              ["SCENARIOS", scenarios.length, CY],
              ["DATASETS", datasets.length, PURPLE],
              ["BACKED", backed.length, GREEN],
              ["DATA-DARK", dark.length, AMBER],
            ].map(([label, val, col]) => (
              <div
                key={label}
                style={{
                  background: `${col}0d`,
                  border: `1px solid ${col}33`,
                  borderRadius: 5,
                  padding: "6px 8px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{ color: col, fontSize: 16, fontWeight: "bold" }}
                >
                  {loading ? "…" : val}
                </div>
                <div
                  style={{
                    color: "#445566",
                    fontSize: 8,
                    letterSpacing: 1,
                    marginTop: 2,
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div
            style={{
              display: "flex",
              gap: 4,
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            {["ALL", "BACKED", "DATA-DARK"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                  color: tab === t ? CY : "#445566",
                  borderRadius: 4,
                  padding: "3px 10px",
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 8,
                  letterSpacing: 1,
                  cursor: "pointer",
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
                marginLeft: "auto",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid #1e3040",
                borderRadius: 4,
                color: "#a0b8cc",
                padding: "3px 8px",
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 8,
                outline: "none",
                width: 120,
              }}
            />
          </div>

          {/* Scenario rows */}
          {loading && displayed.length === 0 ? (
            <div
              style={{
                color: "#445566",
                fontSize: 10,
                textAlign: "center",
                padding: "20px 0",
              }}
            >
              cross-referencing datasets against scenarios…
            </div>
          ) : displayed.length === 0 ? (
            <div
              style={{
                color: "#445566",
                fontSize: 10,
                textAlign: "center",
                padding: "20px 0",
              }}
            >
              {tab === "DATA-DARK"
                ? "All scenarios have dataset coverage."
                : "No scenarios match this filter."}
            </div>
          ) : (
            displayed.map((sc) => {
              const sc2 = statusColor(sc.status);
              const isOpen = expanded === sc.id;
              const hasDatassets = sc.matched.length > 0;
              return (
                <div
                  key={sc.id}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                    borderRadius: 6,
                    padding: "8px 10px",
                    marginBottom: 6,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpanded(isOpen ? null : sc.id)}
                >
                  {/* Scenario header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 7,
                        color: sc2,
                        border: `1px solid ${sc2}55`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        whiteSpace: "nowrap",
                        textTransform: "uppercase",
                      }}
                    >
                      {sc.status}
                    </span>
                    {sc.type && (
                      <span
                        style={{
                          fontSize: 7,
                          color: PURPLE,
                          border: "1px solid #A78BFA44",
                          borderRadius: 3,
                          padding: "1px 5px",
                          letterSpacing: 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {sc.type}
                      </span>
                    )}
                    <span
                      style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}
                    >
                      {sc.name}
                    </span>
                    <span
                      style={{
                        fontSize: 7,
                        color: hasDatassets ? GREEN : AMBER,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {hasDatassets
                        ? `${sc.matched.length} dataset${sc.matched.length !== 1 ? "s" : ""}`
                        : "data-dark"}
                    </span>
                  </div>

                  {/* Objective snippet */}
                  {sc.objective && (
                    <div
                      style={{
                        color: "#556677",
                        fontSize: 8,
                        lineHeight: 1.4,
                        marginBottom: 4,
                      }}
                    >
                      {sc.objective.slice(0, 120)}
                      {sc.objective.length > 120 ? "…" : ""}
                    </div>
                  )}

                  {/* Assess button */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span
                      style={{ fontSize: 7, color: "#334455", flex: 1 }}
                    >
                      {sc.priority && `Priority: ${sc.priority}`}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        assessScenario(sc);
                      }}
                      disabled={assessing === sc.id}
                      style={{
                        background:
                          assessing === sc.id ? "#1a2530" : `${CY}18`,
                        color: assessing === sc.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3,
                        padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 7,
                        letterSpacing: 1,
                        cursor:
                          assessing === sc.id ? "default" : "pointer",
                      }}
                    >
                      {assessing === sc.id ? "…assessing" : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* Expanded dataset list */}
                  {isOpen && hasDatassets && (
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: `1px solid ${CY}18`,
                      }}
                    >
                      {sc.matched.map((ds) => (
                        <div
                          key={ds.id}
                          style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid #1e3040",
                            borderRadius: 4,
                            padding: "6px 8px",
                            marginBottom: 4,
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div
                              style={{ color: "#a0b8cc", fontSize: 10 }}
                            >
                              {ds.name}
                            </div>
                            <div
                              style={{
                                marginTop: 2,
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                flexWrap: "wrap",
                              }}
                            >
                              {ds.type && (
                                <span
                                  style={{
                                    fontSize: 7,
                                    color: PURPLE,
                                    border: "1px solid #A78BFA33",
                                    borderRadius: 2,
                                    padding: "1px 4px",
                                  }}
                                >
                                  {ds.type}
                                </span>
                              )}
                              {ds.row_count !== null && (
                                <span
                                  style={{
                                    fontSize: 7,
                                    color: `${CY}88`,
                                    border: `1px solid ${CY}22`,
                                    borderRadius: 2,
                                    padding: "1px 4px",
                                  }}
                                >
                                  {ds.row_count.toLocaleString()} rows
                                </span>
                              )}
                            </div>
                            {ds.description && (
                              <div
                                style={{
                                  color: "#445566",
                                  fontSize: 8,
                                  lineHeight: 1.4,
                                  marginTop: 3,
                                }}
                              >
                                {ds.description.slice(0, 100)}
                                {ds.description.length > 100 ? "…" : ""}
                              </div>
                            )}
                            {ds.tags.length > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 4,
                                  flexWrap: "wrap",
                                  marginTop: 3,
                                }}
                              >
                                {ds.tags.slice(0, 4).map((tag) => (
                                  <span
                                    key={tag}
                                    style={{
                                      fontSize: 7,
                                      color: `${CY}88`,
                                      border: `1px solid ${CY}22`,
                                      borderRadius: 2,
                                      padding: "1px 4px",
                                    }}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 7,
                              color: `${GREEN}aa`,
                              whiteSpace: "nowrap",
                            }}
                          >
                            score {ds._score}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && !hasDatassets && (
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: "1px solid #1a2530",
                        color: AMBER,
                        fontSize: 8,
                      }}
                    >
                      ⚠ No matching datasets found — this scenario operates data-dark.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div
            style={{
              marginTop: 8,
              color: "#223344",
              fontSize: 7,
              textAlign: "right",
            }}
          >
            /v1/datasets + /v1/scenario/list · 120-s auto-refresh · click ▶
            ASSESS for AI data-readiness brief
          </div>
        </div>
      )}
    </>
  );
}
