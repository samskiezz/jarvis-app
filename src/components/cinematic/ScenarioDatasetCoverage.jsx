/**
 * ScenarioDatasetCoverage — F37 (overnight backlog)
 *
 * Parallel-fetches /v1/scenario/list + /v1/datasets; keyword-correlates each
 * scenario against the dataset catalog to surface DATA_BACKED (scenario has a
 * real data foundation) vs DATA_DARK (no dataset covers it — data gap).
 *
 * Toggle:  ⬡ SCDV  at left:881760 bottom:8 zIndex:583.
 * Event:   jarvis:scdv-toggle
 * Shortcut: Ctrl+Shift+D (unused)
 * Voice:   "scenario dataset / data coverage / data-backed scenarios / scdv"
 * Refresh: 90 s while open.
 * ASSESS:  /v1/jarvis/agent/chat 2-sentence data-readiness brief + TTS.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const GRN   = "#00E5A0";
const AMBER = "#F5A623";
const RED   = "#FF3D5A";
const DIM   = "#0D1520";
const POLL  = 90_000;
const BTN_LEFT = 881760;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

/* ── exported helpers for JarvisBrain ────────────────────────────────────────── */

export function isScenarioDsvQuery(q) {
  return /\b(scenario.?dataset|dataset.?scenario|data.?coverage|data.?backed.?scenario|scdv|scenario.?data|dark.?scenario|data.?foundation)\b/i.test(
    q || ""
  );
}

export async function buildScenarioDsvScript() {
  try {
    const [sr, dr] = await Promise.all([
      fetch(`${apiBase()}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/datasets`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const scenarios = normalise(sr.ok ? await sr.json() : []);
    const datasets  = normalise(dr.ok ? await dr.json() : []);
    const backed = scenarios.filter((s) => hasCoverage(s, datasets)).length;
    const dark   = scenarios.length - backed;
    window.dispatchEvent(new CustomEvent("jarvis:scdv-toggle"));
    if (!scenarios.length) return "No scenarios found in the system, sir.";
    return (
      `Scenario dataset coverage online, sir. ${scenarios.length} scenario${scenarios.length !== 1 ? "s" : ""} cross-referenced against ${datasets.length} dataset${datasets.length !== 1 ? "s" : ""}. ` +
      `${backed} scenario${backed !== 1 ? "s are" : " is"} data-backed; ${dark} ${dark !== 1 ? "are" : "is"} data-dark with no dataset foundation.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:scdv-toggle"));
    return "Scenario dataset coverage panel open, sir.";
  }
}

/* ── helpers ─────────────────────────────────────────────────────────────────── */

function normalise(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of ["items", "results", "data", "scenarios", "datasets", "records"]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
  }
  return [];
}

function kwds(str) {
  if (!str) return [];
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3);
}

function hasCoverage(scenario, datasets) {
  const sWords = new Set([
    ...kwds(scenario.name || scenario.title || ""),
    ...kwds(scenario.description || scenario.summary || ""),
    ...kwds(scenario.type || scenario.category || ""),
  ]);
  if (!sWords.size) return false;
  return datasets.some((ds) => {
    const dWords = kwds(
      [ds.name, ds.title, ds.description, ds.tags, ds.type, ds.source].filter(Boolean).join(" ")
    );
    return dWords.some((w) => sWords.has(w));
  });
}

function matchedDatasets(scenario, datasets) {
  const sWords = new Set([
    ...kwds(scenario.name || scenario.title || ""),
    ...kwds(scenario.description || scenario.summary || ""),
    ...kwds(scenario.type || scenario.category || ""),
  ]);
  if (!sWords.size) return [];
  return datasets
    .map((ds) => {
      const dWords = kwds(
        [ds.name, ds.title, ds.description, ds.tags, ds.type, ds.source].filter(Boolean).join(" ")
      );
      const score = dWords.filter((w) => sWords.has(w)).length;
      return { ds, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ ds, score }) => ({ ds, score }));
}

function statusBadge(s) {
  const st = (s.status || s.state || "active").toLowerCase();
  if (st === "completed" || st === "done") return { label: "DONE", color: GRN };
  if (st === "failed" || st === "error")  return { label: "FAIL", color: RED };
  if (st === "running")                   return { label: "RUN",  color: CY  };
  return { label: "READY", color: AMBER };
}

/* ── component ───────────────────────────────────────────────────────────────── */

export default function ScenarioDatasetCoverage() {
  const [visible,    setVisible]    = useState(false);
  const [scenarios,  setScenarios]  = useState([]);
  const [datasets,   setDatasets]   = useState([]);
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filter,     setFilter]     = useState("all");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [aiText,     setAiText]     = useState("");
  const [aiLoading,  setAiLoading]  = useState(false);
  const pollRef = useRef(null);

  const darkCount   = rows.filter((r) => !r.backed).length;
  const backedCount = rows.filter((r) =>  r.backed).length;

  const fetchData = useCallback(async () => {
    try {
      const [sr, dr] = await Promise.all([
        fetch(`${apiBase()}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/datasets`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const rawScenarios = normalise(sr.ok ? await sr.json() : []);
      const rawDatasets  = normalise(dr.ok ? await dr.json() : []);
      setScenarios(rawScenarios);
      setDatasets(rawDatasets);
      setRows(
        rawScenarios.map((s) => ({
          scenario: s,
          backed: hasCoverage(s, rawDatasets),
          matches: matchedDatasets(s, rawDatasets),
        }))
      );
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:scdv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:scdv-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, POLL);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assess() {
    if (!rows.length) return;
    setAiLoading(true);
    setAiText("");
    const dark = rows.filter((r) => !r.backed).slice(0, 5);
    const prompt =
      `As JARVIS, provide a 2-sentence assessment of data readiness for these scenario-dataset gaps: ` +
      (dark.length
        ? dark.map((r) => `"${r.scenario.name || r.scenario.title || "Unknown"}" (no dataset)`).join("; ")
        : "all scenarios have data coverage") +
      ". Be direct and operational.";
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiText(txt);
      if (txt)
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAiText("Unable to reach reasoning core.");
    } finally {
      setAiLoading(false);
    }
  }

  const filtered = rows.filter((r) => {
    if (filter === "backed") return  r.backed;
    if (filter === "dark")   return !r.backed;
    return true;
  }).filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.scenario.name || r.scenario.title || "").toLowerCase().includes(q) ||
           (r.scenario.description || "").toLowerCase().includes(q);
  });

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        title="Scenario Dataset Coverage"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 583,
          background: "rgba(13,21,32,0.85)", border: `1px solid ${CY}40`,
          color: CY, fontFamily: "monospace", fontSize: 10, padding: "3px 7px",
          borderRadius: 4, cursor: "pointer", letterSpacing: 1,
        }}
      >
        {darkCount > 0 && (
          <span style={{ background: AMBER, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>
            {darkCount}
          </span>
        )}
        ⬡ SCDV
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 56, right: 18, width: 440, maxHeight: "78vh",
      background: "rgba(8,16,26,0.97)", border: `1px solid ${CY}55`,
      borderRadius: 8, zIndex: 583, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CY, overflow: "hidden",
      boxShadow: `0 0 24px ${CY}22`,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${CY}33`, gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>⬡ SCENARIO DATASET COVERAGE</span>
        <span style={{ fontSize: 10, color: GRN }}>{backedCount} BACKED</span>
        <span style={{ fontSize: 10, color: AMBER, marginLeft: 6 }}>{darkCount} DARK</span>
        <button onClick={assess} disabled={aiLoading}
          style={{ marginLeft: 8, background: `${CY}22`, border: `1px solid ${CY}55`, color: CY,
            fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>
          {aiLoading ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setVisible(false)}
          style={{ marginLeft: 6, background: "transparent", border: "none", color: RED, fontSize: 14, cursor: "pointer" }}>
          ✕
        </button>
      </div>

      {/* AI text */}
      {aiText && (
        <div style={{ padding: "8px 14px", background: `${CY}11`, fontSize: 11, lineHeight: 1.5, color: "#b0c8e0", borderBottom: `1px solid ${CY}22` }}>
          {aiText}
        </div>
      )}

      {/* filters + search */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}22`, flexWrap: "wrap" }}>
        {["all", "backed", "dark"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
              background: filter === f ? `${CY}33` : "transparent",
              border: `1px solid ${filter === f ? CY : CY + "44"}`, color: CY,
              letterSpacing: 1, textTransform: "uppercase" }}>
            {f}
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search scenarios…"
          style={{ flex: 1, minWidth: 100, background: `${DIM}`, border: `1px solid ${CY}33`, color: CY,
            borderRadius: 4, fontSize: 10, padding: "2px 7px", outline: "none" }} />
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${CY}22` }}>
        {[
          { label: "SCENARIOS", val: scenarios.length, color: CY   },
          { label: "DATASETS",  val: datasets.length,  color: "#A78BFA" },
          { label: "BACKED",    val: backedCount,       color: GRN  },
          { label: "DARK",      val: darkCount,         color: AMBER },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ flex: 1, textAlign: "center", background: `${color}11`,
            border: `1px solid ${color}33`, borderRadius: 6, padding: "4px 0" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: "#6080a0" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: "center", color: "#4080a0", fontSize: 12 }}>Loading…</div>
        ) : !filtered.length ? (
          <div style={{ padding: 20, textAlign: "center", color: "#4080a0", fontSize: 12 }}>No scenarios found.</div>
        ) : (
          filtered.map((row, i) => {
            const s    = row.scenario;
            const name = s.name || s.title || `Scenario ${i + 1}`;
            const sb   = statusBadge(s);
            const isEx = expanded === i;
            return (
              <div key={i} style={{ borderBottom: `1px solid ${CY}18` }}>
                <div
                  onClick={() => setExpanded(isEx ? null : i)}
                  style={{ display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 14px", cursor: "pointer",
                    background: isEx ? `${CY}0a` : "transparent" }}>
                  <span style={{ fontSize: 10, color: row.backed ? GRN : AMBER, minWidth: 70, letterSpacing: 1 }}>
                    {row.backed ? "DATA_BACKED" : "DATA_DARK"}
                  </span>
                  <span style={{ flex: 1, fontSize: 11, color: "#c8dff0", overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {name}
                  </span>
                  <span style={{ fontSize: 9, background: `${sb.color}22`,
                    border: `1px solid ${sb.color}44`, color: sb.color,
                    borderRadius: 3, padding: "1px 5px" }}>
                    {sb.label}
                  </span>
                  <span style={{ fontSize: 10, color: "#4080a0" }}>{isEx ? "▲" : "▼"}</span>
                </div>

                {isEx && (
                  <div style={{ padding: "6px 14px 12px 14px", background: `${DIM}` }}>
                    {s.description && (
                      <p style={{ fontSize: 10, color: "#7090b0", margin: "0 0 8px" }}>{s.description}</p>
                    )}
                    {row.matches.length > 0 ? (
                      <>
                        <div style={{ fontSize: 9, color: "#5070a0", marginBottom: 4, letterSpacing: 1 }}>
                          MATCHING DATASETS ({row.matches.length})
                        </div>
                        {row.matches.map(({ ds, score }, di) => (
                          <div key={di} style={{ display: "flex", alignItems: "center", gap: 8,
                            marginBottom: 4, padding: "3px 8px", background: `${GRN}0a`,
                            border: `1px solid ${GRN}22`, borderRadius: 4 }}>
                            <span style={{ fontSize: 10, color: GRN, flex: 1 }}>
                              {ds.name || ds.title || ds.id || `Dataset ${di + 1}`}
                            </span>
                            <span style={{ fontSize: 9, color: "#4080a0" }}>
                              {ds.type || ds.format || "dataset"}
                            </span>
                            <span style={{ fontSize: 9, color: GRN }}>
                              {score} kw
                            </span>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div style={{ fontSize: 10, color: AMBER }}>
                        No matching datasets found — data gap.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* footer */}
      <div style={{ padding: "6px 14px", borderTop: `1px solid ${CY}22`,
        fontSize: 9, color: "#3a5060", display: "flex", justifyContent: "space-between" }}>
        <span>/v1/scenario/list · /v1/datasets · {POLL / 1000}s refresh</span>
        <button onClick={fetchData} style={{ background: "transparent", border: "none",
          color: "#4a7090", fontSize: 9, cursor: "pointer" }}>↺</button>
      </div>
    </div>
  );
}
