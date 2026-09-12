/**
 * F765 — Dataset × Report × Scenario Triple Nexus (DRSCTRI)
 * Endpoints: /v1/datasets × /v1/reports × /v1/scenario/list
 * Classification: FULLY_MODELED | REPORT_ONLY | SCENARIO_ONLY | DARK
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 927_240;
const POLL_MS = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  import.meta.env?.VITE_API_KEY ||
  "";

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

const DRSCTRI_RE =
  /\b(drsctri|dataset\s*report\s*scenario|report\s*scenario\s*dataset|scenario\s*dataset\s*report|dataset\s*modeled|dataset\s*scenario\s*coverage|dataset\s*report\s*coverage|dark\s*dataset|unmodeled\s*dataset|dataset\s*coverage\s*triple|data\s*scenario\s*report)\b/i;

export function isDrsctriQuery(t) {
  return DRSCTRI_RE.test(t || "");
}

function normaliseDataset(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.dataset_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.label || "Untitled Dataset",
    kind: raw.kind || raw.type || raw.format || "dataset",
    rows: raw.rows || raw.row_count || raw.count || 0,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function normaliseReport(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.report_id || raw._id || String(Math.random()),
    title: raw.title || raw.name || raw.subject || "Untitled Report",
    type: raw.type || raw.category || raw.kind || "report",
    author: raw.author || raw.created_by || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function normaliseScenario(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.scenario_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.label || "Untitled Scenario",
    kind: raw.kind || raw.type || raw.category || "scenario",
    status: raw.status || raw.state || "active",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function keywords(obj) {
  const txt = JSON.stringify(obj || "").toLowerCase();
  return txt.match(/[a-z]{4,}/g) || [];
}

function scoreMatch(aKw, bKw) {
  const setB = new Set(bKw);
  return aKw.filter((w) => w.length > 3 && setB.has(w)).length;
}

const CLASS_META = {
  FULLY_MODELED: {
    label: "FULLY MODELED",
    color: "#00ff88",
    desc: "Dataset matched to both a Report and a Scenario",
  },
  REPORT_ONLY: {
    label: "REPORT ONLY",
    color: "#00cfff",
    desc: "Dataset documented in a Report but no Scenario coverage",
  },
  SCENARIO_ONLY: {
    label: "SCENARIO ONLY",
    color: "#ffaa00",
    desc: "Dataset covered by a Scenario but no Report",
  },
  DARK: {
    label: "DARK",
    color: "#666",
    desc: "Dataset with no Report or Scenario coverage",
  },
};

function buildNexus(datasets, reports, scenarios) {
  return datasets.map((ds) => {
    const dKw = keywords(ds);
    let bestReport = null;
    let bestReportScore = 0;
    for (const r of reports) {
      const s = scoreMatch(dKw, keywords(r));
      if (s > bestReportScore) {
        bestReportScore = s;
        bestReport = r;
      }
    }
    let bestScenario = null;
    let bestScenarioScore = 0;
    for (const sc of scenarios) {
      const s = scoreMatch(dKw, keywords(sc));
      if (s > bestScenarioScore) {
        bestScenarioScore = s;
        bestScenario = sc;
      }
    }
    const hasReport = bestReport && bestReportScore > 0;
    const hasScenario = bestScenario && bestScenarioScore > 0;
    const cls =
      hasReport && hasScenario
        ? "FULLY_MODELED"
        : hasReport
        ? "REPORT_ONLY"
        : hasScenario
        ? "SCENARIO_ONLY"
        : "DARK";
    return {
      dataset: ds,
      report: hasReport ? bestReport : null,
      reportScore: bestReportScore,
      scenario: hasScenario ? bestScenario : null,
      scenarioScore: bestScenarioScore,
      cls,
    };
  });
}

async function fetchAll() {
  const base = apiBase();
  const hdr = { Authorization: `Bearer ${API_KEY}` };

  const [dsRaw, rRaw, scRaw] = await Promise.all([
    fetch(`${base}/v1/datasets`, { headers: hdr }).then((r) =>
      r.ok ? r.json() : []
    ),
    fetch(`${base}/v1/reports`, { headers: hdr }).then((r) =>
      r.ok ? r.json() : []
    ),
    fetch(`${base}/v1/scenario/list`, { headers: hdr }).then((r) =>
      r.ok ? r.json() : []
    ),
  ]);

  const datasets = (
    Array.isArray(dsRaw) ? dsRaw : dsRaw?.data ?? dsRaw?.datasets ?? []
  )
    .map(normaliseDataset)
    .filter(Boolean);
  const reports = (
    Array.isArray(rRaw) ? rRaw : rRaw?.data ?? rRaw?.reports ?? []
  )
    .map(normaliseReport)
    .filter(Boolean);
  const scenarios = (
    Array.isArray(scRaw) ? scRaw : scRaw?.data ?? scRaw?.scenarios ?? []
  )
    .map(normaliseScenario)
    .filter(Boolean);

  return { datasets, reports, scenarios };
}

export async function buildDrsctriScript() {
  try {
    const { datasets, reports, scenarios } = await fetchAll();
    const rows = buildNexus(datasets, reports, scenarios);
    const counts = {
      FULLY_MODELED: rows.filter((r) => r.cls === "FULLY_MODELED").length,
      REPORT_ONLY: rows.filter((r) => r.cls === "REPORT_ONLY").length,
      SCENARIO_ONLY: rows.filter((r) => r.cls === "SCENARIO_ONLY").length,
      DARK: rows.filter((r) => r.cls === "DARK").length,
    };
    const coverage = datasets.length
      ? Math.round(((rows.length - counts.DARK) / rows.length) * 100)
      : 0;
    return (
      `Dataset Report Scenario Triple Nexus: ${datasets.length} datasets cross-referenced against ` +
      `${reports.length} reports and ${scenarios.length} scenarios. ` +
      `Fully modeled: ${counts.FULLY_MODELED}. ` +
      `Report only: ${counts.REPORT_ONLY}. ` +
      `Scenario only: ${counts.SCENARIO_ONLY}. ` +
      `Dark (no coverage): ${counts.DARK}. ` +
      `Overall coverage: ${coverage}%.`
    );
  } catch (e) {
    return `Dataset Report Scenario Nexus unavailable: ${e.message}`;
  }
}

export default function DatasetReportScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({
    FULLY_MODELED: 0,
    REPORT_ONLY: 0,
    SCENARIO_ONLY: 0,
    DARK: 0,
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const intervalRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      setOpen((v) => (e.detail?.force !== undefined ? e.detail.force : !v));
    }
    window.addEventListener("jarvis:drsctri-toggle", handler);
    return () => window.removeEventListener("jarvis:drsctri-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) {
      clearInterval(intervalRef.current);
      return;
    }
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const { datasets, reports, scenarios } = await fetchAll();
        const nexus = buildNexus(datasets, reports, scenarios);
        setRows(nexus);
        setCounts({
          FULLY_MODELED: nexus.filter((r) => r.cls === "FULLY_MODELED").length,
          REPORT_ONLY: nexus.filter((r) => r.cls === "REPORT_ONLY").length,
          SCENARIO_ONLY: nexus.filter((r) => r.cls === "SCENARIO_ONLY").length,
          DARK: nexus.filter((r) => r.cls === "DARK").length,
        });
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
    intervalRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [open]);

  const visible = rows.filter((r) => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.dataset.name.toLowerCase().includes(q) ||
        (r.report?.title || "").toLowerCase().includes(q) ||
        (r.scenario?.name || "").toLowerCase().includes(q) ||
        r.dataset.kind.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const darkBadge = counts.DARK;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 622,
          fontFamily: "monospace",
          fontSize: 10,
          padding: "2px 7px",
          background: open ? "#001a08" : "#0a0a0a",
          color: open ? "#00ff88" : "#555",
          border: `1px solid ${open ? "#00ff88" : "#333"}`,
          borderRadius: 3,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        title="Dataset × Report × Scenario Triple Nexus"
      >
        DRSCTRI{darkBadge > 0 ? ` [${darkBadge}]` : ""}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 36,
            left: BTN_LEFT - 200,
            width: 880,
            maxHeight: 560,
            zIndex: 622,
            background: "#000d04",
            border: "1px solid #00ff88",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 11,
            color: "#ccc",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 0 24px #00ff8844",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "6px 12px",
              borderBottom: "1px solid #00ff8844",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ color: "#00ff88", fontWeight: "bold", fontSize: 12 }}>
              DRSCTRI
            </span>
            <span style={{ color: "#555", fontSize: 10 }}>
              Dataset × Report × Scenario
            </span>
            {loading && (
              <span style={{ color: "#00ff88", marginLeft: "auto", fontSize: 10 }}>
                LOADING…
              </span>
            )}
            {err && (
              <span style={{ color: "#f55", marginLeft: "auto", fontSize: 10 }}>
                ERR: {err}
              </span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                color: "#666",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "6px 12px",
              flexShrink: 0,
              borderBottom: "1px solid #00ff8822",
            }}
          >
            {Object.entries(CLASS_META).map(([k, meta]) => (
              <div
                key={k}
                onClick={() => setFilter(filter === k ? "ALL" : k)}
                style={{
                  flex: 1,
                  background: filter === k ? "#001a08" : "#111",
                  border: `1px solid ${filter === k ? meta.color : "#333"}`,
                  borderRadius: 4,
                  padding: "4px 6px",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                <div style={{ color: meta.color, fontSize: 16, fontWeight: "bold" }}>
                  {counts[k]}
                </div>
                <div style={{ color: "#666", fontSize: 9 }}>{meta.label}</div>
              </div>
            ))}
          </div>

          {/* Search + count */}
          <div
            style={{
              padding: "4px 12px",
              flexShrink: 0,
              display: "flex",
              gap: 8,
              alignItems: "center",
              borderBottom: "1px solid #00ff8822",
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search datasets / reports / scenarios…"
              style={{
                flex: 1,
                background: "#111",
                border: "1px solid #333",
                borderRadius: 3,
                color: "#ccc",
                fontFamily: "monospace",
                fontSize: 10,
                padding: "2px 6px",
              }}
            />
            <span style={{ color: "#555", fontSize: 10 }}>
              {visible.length}/{rows.length}
            </span>
          </div>

          {/* Rows */}
          <div style={{ overflow: "auto", flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: 16, color: "#444", textAlign: "center" }}>
                {err ? "Error loading data." : "No datasets match."}
              </div>
            )}
            {visible.map((row, i) => {
              const meta = CLASS_META[row.cls];
              return (
                <div
                  key={row.dataset.id + i}
                  style={{
                    padding: "5px 12px",
                    borderBottom: "1px solid #001a08",
                    display: "grid",
                    gridTemplateColumns: "100px 1fr 1fr 1fr",
                    gap: 6,
                    alignItems: "start",
                  }}
                >
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "1px 4px",
                        borderRadius: 2,
                        background: "#001a08",
                        border: `1px solid ${meta.color}`,
                        color: meta.color,
                        fontSize: 9,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {meta.label}
                    </span>
                    <div style={{ color: "#555", fontSize: 9, marginTop: 2 }}>
                      {row.dataset.kind}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#00ff88", fontSize: 10, fontWeight: "bold" }}>
                      {row.dataset.name}
                    </div>
                    <div style={{ color: "#555", fontSize: 9 }}>
                      {row.dataset.rows > 0 ? `${row.dataset.rows.toLocaleString()} rows` : "dataset"}
                    </div>
                  </div>
                  <div>
                    {row.report ? (
                      <>
                        <div style={{ color: "#00cfff", fontSize: 10 }}>
                          {row.report.title}
                        </div>
                        <div style={{ color: "#555", fontSize: 9 }}>
                          {row.report.type} · score {row.reportScore}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: "#333", fontSize: 10 }}>—</div>
                    )}
                  </div>
                  <div>
                    {row.scenario ? (
                      <>
                        <div style={{ color: "#ffaa00", fontSize: 10 }}>
                          {row.scenario.name}
                        </div>
                        <div style={{ color: "#555", fontSize: 9 }}>
                          {row.scenario.kind} · score {row.scenarioScore}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: "#333", fontSize: 10 }}>—</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "3px 12px",
              borderTop: "1px solid #00ff8822",
              color: "#444",
              fontSize: 9,
              flexShrink: 0,
            }}
          >
            /v1/datasets × /v1/reports × /v1/scenario/list · poll {POLL_MS / 1000}s
          </div>
        </div>
      )}
    </>
  );
}
