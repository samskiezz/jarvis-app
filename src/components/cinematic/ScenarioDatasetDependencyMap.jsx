import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#00E5FF";
const AM = "#FFB300";
const GR = "#4CAF50";
const DIM = "#6E8AA0";
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT = 979_880;

// ── Query matchers exported for JarvisBrain ───────────────────────────────
const SDDEP_RE = /\b(sddep|scenario[\s_-]*dataset|dataset[\s_-]*scenario|unsourced\s*scenario|scenario\s*data\s*(dep|depend)|scenario\s*data\s*coverage|dataset\s*coverage\s*scenario)\b/i;
export function isSddepQuery(q) { return SDDEP_RE.test(q); }

function keywords(str = "") {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function relevance(scenario, dataset) {
  const skw = keywords(
    `${scenario.name || scenario.title || ""} ${scenario.description || ""} ${scenario.type || ""} ${(scenario.tags || []).join(" ")}`
  );
  const dkw = keywords(
    `${dataset.name || dataset.title || ""} ${dataset.description || ""} ${dataset.type || ""} ${dataset.format || ""} ${(dataset.tags || []).join(" ")}`
  );
  if (!skw.length || !dkw.length) return 0;
  const shared = skw.filter(w => dkw.includes(w));
  return shared.length / Math.max(skw.length, dkw.length);
}

export async function buildSddepScript() {
  const base = apiBase();
  const [scRes, dsRes] = await Promise.allSettled([
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
    fetch(`${base}/v1/datasets`).then(r => r.json()),
  ]);

  const scenarios = scRes.status === "fulfilled"
    ? (scRes.value?.items || scRes.value || [])
    : [];
  const datasets = dsRes.status === "fulfilled"
    ? (dsRes.value?.items || dsRes.value || [])
    : [];

  const sourced   = scenarios.filter(sc => datasets.some(d => relevance(sc, d) > 0));
  const unsourced = scenarios.filter(sc => !datasets.some(d => relevance(sc, d) > 0));

  const snapshot =
    `Scenarios: ${scenarios.length} total, ${sourced.length} dataset-sourced, ` +
    `${unsourced.length} unsourced. Datasets available: ${datasets.length}.`;

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message: `Scenario dataset dependency analysis. Provide exactly 2 sentences: current data coverage status across operational scenarios, and recommended action to source unsourced scenarios. Data: ${snapshot}`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim()
    || `${sourced.length} of ${scenarios.length} scenarios are dataset-sourced. ${unsourced.length} scenarios lack dataset grounding and should be reviewed for evidence gaps.`;
}

// ── Component ─────────────────────────────────────────────────────────────
export default function ScenarioDatasetDependencyMap() {
  const [open, setOpen]         = useState(false);
  const [scenarios, setScens]   = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]       = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    const base = apiBase();
    const [scRes, dsRes] = await Promise.allSettled([
      fetch(`${base}/v1/scenario/list`).then(r => r.json()),
      fetch(`${base}/v1/datasets`).then(r => r.json()),
    ]);
    const scList = scRes.status === "fulfilled"
      ? (scRes.value?.items || scRes.value || []) : [];
    const dsList = dsRes.status === "fulfilled"
      ? (dsRes.value?.items || dsRes.value || []) : [];
    setScens(scList);
    setDatasets(dsList);

    const enrichedList = scList.map(sc => {
      const matches = dsList
        .map(d => ({ ...d, score: relevance(sc, d) }))
        .filter(d => d.score > 0)
        .sort((a, b) => b.score - a.score);
      return { ...sc, matches, sourced: matches.length > 0 };
    });
    setEnriched(enrichedList);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:sddep-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sddep-toggle", onToggle);
  }, []);

  const unsourcedCount = enriched.filter(e => !e.sourced).length;

  const filtered = enriched.filter(sc => {
    if (tab === "SOURCED"   && !sc.sourced) return false;
    if (tab === "UNSOURCED" &&  sc.sourced) return false;
    if (search) {
      const s = search.toLowerCase();
      const label = `${sc.name || sc.title || ""} ${sc.description || ""}`.toLowerCase();
      if (!label.includes(s)) return false;
    }
    return true;
  });

  async function assess() {
    setAssess(true); setBrief("");
    try {
      const script = await buildSddepScript();
      setBrief(script);
      if (window.__jarvisTts) window.__jarvisTts(script);
    } catch { setBrief("Unable to reach reasoning core."); }
    setAssess(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario × Dataset Dependency Map (SDDEP)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 127,
          padding: "4px 9px", borderRadius: 6, border: `1px solid ${AM}`,
          background: "rgba(5,8,13,0.82)", color: AM, fontSize: 10,
          letterSpacing: 1, cursor: "pointer", fontFamily: "monospace",
          boxShadow: unsourcedCount > 0 ? `0 0 10px ${AM}66` : "none",
        }}
      >
        ◈ SDDEP
        {unsourcedCount > 0 && (
          <span style={{ marginLeft: 5, background: AM, color: "#000", borderRadius: 4,
            padding: "1px 5px", fontSize: 9 }}>
            {unsourcedCount}
          </span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "SOURCED", "UNSOURCED"];

  return (
    <div style={{
      position: "fixed", left: 18, top: 60, zIndex: 127,
      width: "min(620px,90vw)", maxHeight: "82vh",
      background: "rgba(6,10,18,0.93)", border: `1px solid ${CY}44`,
      borderRadius: 12, fontFamily: "'JetBrains Mono',monospace",
      color: "#DCEBF5", display: "flex", flexDirection: "column",
      boxShadow: `0 0 40px ${CY}18`, backdropFilter: "blur(10px)",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
        borderBottom: `1px solid ${CY}22` }}>
        <span style={{ color: CY, fontSize: 12, letterSpacing: 2, textShadow: `0 0 8px ${CY}` }}>
          ◈ SCENARIO × DATASET DEPENDENCY MAP
        </span>
        <button onClick={() => setOpen(false)}
          style={{ marginLeft: "auto", background: "none", border: "none",
            color: DIM, fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", flexWrap: "wrap" }}>
        {[
          ["SCENARIOS", enriched.length, CY],
          ["DATASETS",  datasets.length, DIM],
          ["SOURCED",   enriched.filter(e => e.sourced).length, GR],
          ["UNSOURCED", unsourcedCount, AM],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            flex: "1 1 100px", background: "rgba(255,255,255,0.03)",
            border: `1px solid ${col}33`, borderRadius: 8,
            padding: "6px 10px", textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
            <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* filter bar */}
      <div style={{ display: "flex", gap: 6, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 10,
            border: `1px solid ${tab === t ? CY : CY + "33"}`,
            background: tab === t ? CY + "22" : "transparent", color: tab === t ? CY : DIM,
          }}>{t}</button>
        ))}
        <input
          placeholder="search…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 100, background: "rgba(255,255,255,0.05)",
            border: `1px solid ${CY}33`, borderRadius: 4, color: "#DCEBF5",
            fontSize: 11, padding: "3px 8px", outline: "none" }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 8px" }}>
        {filtered.length === 0 && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 20 }}>
            {enriched.length === 0 ? "Loading scenarios…" : "No scenarios match filter."}
          </div>
        )}
        {filtered.map((sc, i) => {
          const id = sc.id || sc.scenario_id || i;
          const isExp = expanded === id;
          const label = sc.name || sc.title || `Scenario ${i + 1}`;
          const type  = sc.type || sc.category || "scenario";
          return (
            <div key={id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 6, cursor: "pointer",
                  border: `1px solid ${sc.sourced ? GR : AM}33`,
                  background: `${sc.sourced ? GR : AM}0A`,
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: sc.sourced ? GR : AM,
                  boxShadow: sc.sourced ? `0 0 6px ${GR}` : `0 0 8px ${AM}`,
                }} />
                <span style={{ flex: 1, fontSize: 11, color: "#DCEBF5", wordBreak: "break-word" }}>{label}</span>
                <span style={{
                  fontSize: 9, padding: "2px 6px", borderRadius: 3, letterSpacing: 1,
                  background: sc.sourced ? GR + "33" : AM + "33",
                  color: sc.sourced ? GR : AM,
                }}>{sc.sourced ? "SOURCED" : "UNSOURCED"}</span>
                <span style={{ fontSize: 9, color: DIM }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 10px 4px 20px", borderLeft: `2px solid ${CY}33` }}>
                  <div style={{ color: DIM, fontSize: 10, marginBottom: 4 }}>
                    TYPE: {type.toUpperCase()}
                    {sc.description && <> · {sc.description.slice(0, 120)}{sc.description.length > 120 ? "…" : ""}</>}
                  </div>
                  {sc.matches.length === 0 ? (
                    <div style={{ color: AM, fontSize: 10 }}>No dataset matches found — this scenario lacks data grounding.</div>
                  ) : (
                    sc.matches.slice(0, 5).map((d, j) => (
                      <div key={j} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        marginBottom: 4, background: "rgba(0,229,255,0.04)",
                        borderRadius: 4, padding: "4px 8px",
                      }}>
                        <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", wordBreak: "break-word" }}>
                          {d.name || d.title || `Dataset ${j + 1}`}
                        </span>
                        <span style={{ fontSize: 9, color: DIM, whiteSpace: "nowrap" }}>
                          {d.type || d.format || ""}
                        </span>
                        <div style={{
                          width: 50, height: 4, borderRadius: 2,
                          background: "rgba(255,255,255,0.1)", overflow: "hidden",
                        }}>
                          <div style={{
                            width: `${Math.round(d.score * 100)}%`, height: "100%",
                            background: GR, borderRadius: 2,
                          }} />
                        </div>
                        <span style={{ fontSize: 9, color: GR }}>{Math.round(d.score * 100)}%</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* brief */}
      {brief && (
        <div style={{ margin: "0 14px 8px", padding: "8px 10px", borderRadius: 6,
          background: `${CY}0D`, border: `1px solid ${CY}33`,
          fontSize: 11, lineHeight: 1.5, color: "#DCEBF5" }}>
          {brief}
        </div>
      )}

      {/* footer */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${CY}22`,
        display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={assess} disabled={assessing} style={{
          padding: "5px 14px", borderRadius: 5, cursor: "pointer", fontSize: 10,
          border: `1px solid ${CY}`, background: assessing ? CY + "33" : CY + "22",
          color: CY, letterSpacing: 1,
        }}>
          {assessing ? "ASSESSING…" : "▶ ASSESS COVERAGE"}
        </button>
        <span style={{ fontSize: 9, color: DIM, marginLeft: "auto" }}>
          90s auto-refresh · {enriched.length} scenarios · {datasets.length} datasets
        </span>
      </div>
    </div>
  );
}
