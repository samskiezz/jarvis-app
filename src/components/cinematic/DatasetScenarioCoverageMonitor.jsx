/**
 * DatasetScenarioCoverageMonitor — F509
 * "JARVIS, dataset scenario / scenario dataset / dscncov / which datasets are modeled / dataset simulation / scenario data coverage"
 * Cross-references /v1/datasets + /v1/scenario/list.
 * Finds MODELED datasets (≥1 scenario keyword-matches the dataset name/description) vs UNMODELED.
 * Coverage % tile; ALL/MODELED/UNMODELED filter tabs + search; click-to-expand matched scenarios.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 30_700;
const Z_INDEX  = 94;

const DSCNCOV_RE =
  /\bdscncov\b|\bdataset.?scenario\b|\bscenario.?dataset\b|\bwhich.?datasets?.?are.?modeled\b|\bdataset.?simulation\b|\bscenario.?data.?coverage\b|\bmodeled.?dataset\b|\bunmodeled.?dataset\b|\bdata.?scenario.?coverage\b/i;

export function isDatasetScenarioQuery(text) {
  return DSCNCOV_RE.test(text || "");
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

function normaliseDatasets(data) {
  if (!data) return [];
  const raw =
    data.datasets || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((d, i) => ({
    id:          d.id || d.dataset_id || `ds-${i}`,
    name:        d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    description: d.description || d.summary || null,
    rows:        d.rows ?? d.row_count ?? d.count ?? null,
    kind:        (d.kind || d.type || d.category || "").toUpperCase() || "DATA",
    tags:        Array.isArray(d.tags) ? d.tags.join(" ") : String(d.tags || ""),
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
    kind:        (s.kind || s.type || s.category || "GENERAL").toUpperCase(),
    description: s.description || s.summary || null,
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : String(s.tags || ""),
  }));
}

function crossRef(datasets, scenarios) {
  return datasets.map((ds) => {
    const haystack = `${ds.name} ${ds.description || ""} ${ds.tags}`;
    const matches = scenarios
      .map((sc) => ({
        sc,
        hits: overlap(haystack, `${sc.name} ${sc.description || ""} ${sc.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...ds,
      modeled: matches.length > 0,
      matches: matches.map(({ sc, hits }) => ({ ...sc, hits })),
    };
  });
}

// ─── buildDatasetScenarioScript (for JarvisBrain) ────────────────────────────

export async function buildDatasetScenarioScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [dsRes, scRes] = await Promise.all([
      fetch(`${base}/v1/datasets`,       { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,  { headers: hdr }),
    ]);
    const dsData = dsRes.ok ? await dsRes.json() : {};
    const scData = scRes.ok ? await scRes.json() : {};

    const datasets  = normaliseDatasets(dsData);
    const scenarios = normaliseScenarios(scData);
    const crossed   = crossRef(datasets, scenarios);

    const total    = crossed.length;
    const modeled  = crossed.filter((d) => d.modeled).length;
    const unmoded  = total - modeled;
    const coverage = total > 0 ? Math.round((modeled / total) * 100) : 0;
    const topMod   = crossed
      .filter((d) => d.modeled)
      .slice(0, 2)
      .map((d) => d.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} datasets are modeled in active scenarios. ` +
      `${modeled} MODELED, ${unmoded} UNMODELED.` +
      (topMod ? ` Top modeled datasets: ${topMod}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Dataset × Scenario Coverage: ${brief} Provide a 2-sentence operational assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Dataset × Scenario Coverage unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const KIND_COLOR = {
  THREAT: "#FF4466",
  INTEL:  "#FFA500",
  OPS:    "#29E7FF",
  RISK:   "#FF6B35",
  GENERAL: "#8899AA",
};

export default function DatasetScenarioCoverageMonitor() {
  const [open, setOpen]         = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [scenarios, setScen]    = useState([]);
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
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [dsRes, scRes] = await Promise.all([
        fetch(`${base}/v1/datasets`,      { headers: hdr }),
        fetch(`${base}/v1/scenario/list`, { headers: hdr }),
      ]);
      const dsData = dsRes.ok ? await dsRes.json() : {};
      const scData = scRes.ok ? await scRes.json() : {};
      const dss = normaliseDatasets(dsData);
      const scs = normaliseScenarios(scData);
      setDatasets(dss);
      setScen(scs);
      setCrossed(crossRef(dss, scs));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () =>
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    window.addEventListener("jarvis:dscncov-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dscncov-toggle", onToggle);
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
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const total    = crossed.length;
      const modeled  = crossed.filter((d) => d.modeled).length;
      const unmoded  = total - modeled;
      const coverage = total > 0 ? Math.round((modeled / total) * 100) : 0;
      const prompt   = `Dataset × Scenario Coverage: ${coverage}% coverage (${modeled}/${total} modeled, ${unmoded} unmodeled). Assess in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d = res.ok ? await res.json() : {};
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

  const visible = crossed.filter((ds) => {
    if (tab === "MODELED"   && !ds.modeled) return false;
    if (tab === "UNMODELED" &&  ds.modeled) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !ds.name.toLowerCase().includes(q) &&
        !(ds.description || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const total      = crossed.length;
  const nModeled   = crossed.filter((d) => d.modeled).length;
  const nUnmodeled = total - nModeled;
  const coverage   = total > 0 ? Math.round((nModeled / total) * 100) : 0;

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
        title="Dataset × Scenario Coverage Monitor"
      >
        ◈ DSCNCOV
        {nUnmodeled > 0 && (
          <span
            style={{
              background: AMB,
              color: "#000",
              borderRadius: 8,
              padding: "0 4px",
              fontSize: 9,
            }}
          >
            {nUnmodeled}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>
              DATASET × SCENARIO COVERAGE
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{
                  background: "none",
                  border: `1px solid ${CY}55`,
                  color: CY,
                  cursor: "pointer",
                  padding: "2px 8px",
                  borderRadius: 3,
                  fontSize: 10,
                }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: DIM,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              {
                label: "COVERAGE",
                value: `${coverage}%`,
                color: coverage > 60 ? GRN : coverage > 30 ? AMB : "#FF4466",
              },
              { label: "MODELED",   value: nModeled,   color: GRN },
              { label: "UNMODELED", value: nUnmodeled,  color: AMB },
              { label: "SCENARIOS", value: scenarios.length, color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  background: "rgba(41,231,255,0.05)",
                  border: `1px solid ${color}33`,
                  borderRadius: 4,
                  padding: "6px 8px",
                  textAlign: "center",
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
                background: assessing
                  ? "rgba(41,231,255,0.1)"
                  : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY,
                cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px",
                borderRadius: 3,
                fontSize: 10,
                fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 10,
                  color: "#cde",
                  lineHeight: 1.5,
                  padding: "6px 8px",
                  background: "rgba(41,231,255,0.05)",
                  borderRadius: 3,
                }}
              >
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "MODELED", "UNMODELED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer",
                  padding: "2px 10px",
                  borderRadius: 3,
                  fontSize: 10,
                  fontFamily: "monospace",
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
            placeholder="Search datasets…"
            style={{
              width: "100%",
              background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`,
              color: CY,
              padding: "4px 8px",
              borderRadius: 3,
              fontSize: 10,
              marginBottom: 8,
              boxSizing: "border-box",
              fontFamily: "monospace",
            }}
          />

          {/* Dataset rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
              Loading…
            </div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
              No datasets match.
            </div>
          ) : (
            visible.map((ds) => (
              <div key={ds.id}>
                <div
                  onClick={() =>
                    setExpanded(expanded === ds.id ? null : ds.id)
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 6px",
                    marginBottom: 3,
                    cursor: "pointer",
                    borderRadius: 3,
                    background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${
                      ds.modeled ? GRN + "44" : DIM + "22"
                    }`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: ds.modeled ? GRN : DIM,
                      minWidth: 68,
                    }}
                  >
                    {ds.modeled ? "MODELED" : "UNMODELED"}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 10,
                      color: ds.modeled ? GRN : DIM,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ds.name}
                  </span>
                  {ds.rows !== null && (
                    <span style={{ fontSize: 8, color: DIM }}>
                      {ds.rows.toLocaleString()} rows
                    </span>
                  )}
                  {ds.modeled && (
                    <span style={{ fontSize: 8, color: GRN }}>
                      ⬡ {ds.matches.length} scn
                    </span>
                  )}
                </div>

                {/* Expanded matched scenarios */}
                {expanded === ds.id && ds.modeled && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {ds.description && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>
                        {ds.description}
                      </div>
                    )}
                    {ds.matches.map((sc) => (
                      <div
                        key={sc.id}
                        style={{
                          padding: "3px 6px",
                          marginBottom: 2,
                          borderRadius: 2,
                          background: "rgba(0,229,160,0.05)",
                          border: `1px solid ${
                            KIND_COLOR[sc.kind] || DIM
                          }33`,
                          fontSize: 9,
                        }}
                      >
                        <span
                          style={{
                            color: KIND_COLOR[sc.kind] || DIM,
                            marginRight: 4,
                          }}
                        >
                          [{sc.kind}]
                        </span>
                        <span style={{ color: GRN }}>{sc.name}</span>
                        <span style={{ color: DIM, marginLeft: 6 }}>
                          hits:{sc.hits}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === ds.id && !ds.modeled && (
                  <div
                    style={{
                      marginLeft: 12,
                      marginBottom: 6,
                      fontSize: 9,
                      color: DIM,
                    }}
                  >
                    No scenarios reference this dataset.
                    {ds.description && (
                      <div style={{ marginTop: 2 }}>{ds.description}</div>
                    )}
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
