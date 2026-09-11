import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GR = "#22C55E";
const AM = "#FFB300";
const RD = "#FF4444";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_KEY) ||
  "dev-key";

const SIDTRI_RE =
  /\b(sidtri|scenario[._-]?intel[._-]?dataset|scenario[._-]?dataset[._-]?intel|intelligence[._-]?ready[._-]?scenario|dark[._-]?scenario[._-]?intel|scenario[._-]?intel[._-]?readiness|scenario[._-]?dataset[._-]?readiness|intel[._-]?ready[._-]?scenarios|dataset[._-]?ready[._-]?scenarios|scenario[._-]?intelligence[._-]?readiness|scenario[._-]?resource[._-]?triple)\b/i;

export function isSidtriQuery(t) {
  return SIDTRI_RE.test(t || "");
}

function tok(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w.length > 2);
}

function overlap(a, b) {
  const sa = new Set(tok(a));
  const sb = new Set(tok(b));
  let hits = 0;
  for (const w of sa) if (sb.has(w)) hits++;
  return sa.size ? hits / sa.size : 0;
}

function scenarioHaystack(s) {
  return [s.title, s.name, s.description, s.summary, ...(s.tags || [])].join(" ");
}

function intelNeedle(p) {
  return [p.name, p.title, p.summary, p.category, p.type, ...(p.tags || [])].join(" ");
}

function datasetNeedle(d) {
  return [d.name, d.title, d.description, d.category, d.type, ...(d.tags || [])].join(" ");
}

function bestScore(scenario, items, needleFn) {
  const hay = scenarioHaystack(scenario);
  let best = 0;
  for (const it of items) {
    const s = overlap(hay, needleFn(it));
    if (s > best) best = s;
  }
  return best;
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["scenarios", "items", "results", "data", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseProfiles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["profiles", "intel_profiles", "items", "results", "data", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["datasets", "items", "results", "data", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

export async function buildSidtriScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [sr, pr, dr] = await Promise.allSettled([
      fetch(`${base}/v1/scenario/list`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/datasets`, { headers: hdr }).then((r) => r.json()),
    ]);
    const scenarios = normaliseScenarios(sr.status === "fulfilled" ? sr.value : []).slice(0, 100);
    const profiles = normaliseProfiles(pr.status === "fulfilled" ? pr.value : []).slice(0, 200);
    const datasets = normaliseDatasets(dr.status === "fulfilled" ? dr.value : []).slice(0, 200);

    let ready = 0, profileOnly = 0, dataOnly = 0, dark = 0;
    for (const sc of scenarios) {
      const hasIntel = bestScore(sc, profiles, intelNeedle) > 0.15;
      const hasData = bestScore(sc, datasets, datasetNeedle) > 0.15;
      if (hasIntel && hasData) ready++;
      else if (hasIntel) profileOnly++;
      else if (hasData) dataOnly++;
      else dark++;
    }
    const total = scenarios.length;
    return (
      `Scenario intelligence readiness: ${total} scenarios assessed — ` +
      `${ready} INTELLIGENCE-READY (intel profile + dataset), ` +
      `${profileOnly} PROFILE-ONLY (intel coverage, no data), ` +
      `${dataOnly} DATA-ONLY (dataset found, no intel profile), ` +
      `${dark} DARK (no intel or dataset backing — scenario is unresourced). ` +
      `${dark > 0 ? `${dark} scenario${dark > 1 ? "s" : ""} lack any intelligence or data support — recommend sourcing action.` : "All scenarios have at least some intelligence or data coverage."}`
    );
  } catch {
    return "Scenario intelligence readiness assessment unavailable.";
  }
}

const ScoreBar = ({ sc, color }) => (
  <div style={{ background: "#111", borderRadius: 2, height: 3, width: "100%", overflow: "hidden" }}>
    <div style={{ width: `${Math.round(sc * 100)}%`, background: color, height: "100%", transition: "width .3s" }} />
  </div>
);

const chip = (label, color = CY) => (
  <span
    style={{
      display: "inline-block",
      padding: "1px 6px",
      border: `1px solid ${color}`,
      borderRadius: 3,
      color,
      fontSize: 9,
      letterSpacing: 1,
      marginRight: 4,
    }}
  >
    {label}
  </span>
);

const TABS = ["ALL", "INTELLIGENCE-READY", "PROFILE-ONLY", "DATA-ONLY", "DARK"];

export default function ScenarioIntelDatasetTriple() {
  const [open, setOpen] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const [err, setErr] = useState("");
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [sr, pr, dr] = await Promise.allSettled([
        fetch(`${base}/v1/scenario/list`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/datasets`, { headers: hdr }).then((r) => r.json()),
      ]);
      setScenarios(normaliseScenarios(sr.status === "fulfilled" ? sr.value : []).slice(0, 100));
      setProfiles(normaliseProfiles(pr.status === "fulfilled" ? pr.value : []).slice(0, 200));
      setDatasets(normaliseDatasets(dr.status === "fulfilled" ? dr.value : []).slice(0, 200));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onToggle() {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    }
    window.addEventListener("jarvis:sidtri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sidtri-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  function classify(sc) {
    const hasIntel = bestScore(sc, profiles, intelNeedle) > 0.15;
    const hasData = bestScore(sc, datasets, datasetNeedle) > 0.15;
    if (hasIntel && hasData) return "INTELLIGENCE-READY";
    if (hasIntel) return "PROFILE-ONLY";
    if (hasData) return "DATA-ONLY";
    return "DARK";
  }

  function matchedProfiles(sc) {
    const hay = scenarioHaystack(sc);
    return profiles
      .map((p) => ({ p, sc: overlap(hay, intelNeedle(p)) }))
      .filter((x) => x.sc > 0.05)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
  }

  function matchedDatasets(sc) {
    const hay = scenarioHaystack(sc);
    return datasets
      .map((d) => ({ d, sc: overlap(hay, datasetNeedle(d)) }))
      .filter((x) => x.sc > 0.05)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
  }

  const enriched = scenarios.map((sc) => ({ ...sc, _class: classify(sc) }));

  const readyCount = enriched.filter((sc) => sc._class === "INTELLIGENCE-READY").length;
  const profileOnlyCount = enriched.filter((sc) => sc._class === "PROFILE-ONLY").length;
  const dataOnlyCount = enriched.filter((sc) => sc._class === "DATA-ONLY").length;
  const darkCount = enriched.filter((sc) => sc._class === "DARK").length;

  const filtered = enriched.filter((sc) => {
    if (tab !== "ALL" && sc._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (sc.title || sc.name || "").toLowerCase().includes(q) ||
        (sc.description || sc.summary || "").toLowerCase().includes(q) ||
        (sc.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText("");
    try {
      const script = await buildSidtriScript();
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessText(answer);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      setAssessText(await buildSidtriScript());
    } finally {
      setAssessing(false);
    }
  }

  const classColor = (cl) => {
    if (cl === "INTELLIGENCE-READY") return CY;
    if (cl === "PROFILE-ONLY") return GR;
    if (cl === "DATA-ONLY") return AM;
    return RD;
  };

  const mono = { fontFamily: "'JetBrains Mono',monospace" };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Scenario × Intel Profile × Dataset Intelligence Readiness (SIDTRI)"
        style={{
          position: "fixed",
          left: 728320,
          bottom: 8,
          zIndex: 329,
          background: "rgba(0,0,0,0.85)",
          border: `1px solid ${CY}`,
          borderRadius: 4,
          color: CY,
          fontSize: 9,
          padding: "3px 7px",
          cursor: "pointer",
          letterSpacing: 1,
          ...mono,
        }}
      >
        ◈ SIDTRI
        {darkCount > 0 && (
          <span
            style={{
              marginLeft: 4,
              background: RD,
              color: "#000",
              borderRadius: 3,
              padding: "0 4px",
              fontSize: 8,
            }}
          >
            {darkCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        top: 16,
        width: 720,
        maxHeight: 640,
        background: "rgba(0,0,0,0.96)",
        border: `1px solid ${CY}`,
        borderRadius: 6,
        zIndex: 9600,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...mono,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: `1px solid ${CY}22`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ color: CY, fontSize: 10, letterSpacing: 2, flex: 1 }}>
          ◈ SCENARIO × INTEL PROFILE × DATASET — INTELLIGENCE READINESS
        </span>
        {loading && <span style={{ color: CY, fontSize: 9 }}>LOADING…</span>}
        <button
          onClick={load}
          style={{ background: "none", border: `1px solid ${CY}44`, color: CY, fontSize: 9, padding: "2px 6px", cursor: "pointer", borderRadius: 3 }}
        >
          ↺
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#888", fontSize: 12, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${CY}22` }}>
        {[
          ["SCENARIOS", scenarios.length, CY],
          ["INTEL PROFILES", profiles.length, GR],
          ["DATASETS", datasets.length, AM],
          ["INTEL-READY", readyCount, CY],
          ["DARK", darkCount, RD],
        ].map(([label, val, color]) => (
          <div
            key={label}
            style={{
              flex: 1,
              background: "#0a0a0a",
              border: `1px solid ${color}44`,
              borderRadius: 4,
              padding: "4px 6px",
              textAlign: "center",
            }}
          >
            <div style={{ color, fontSize: 14 }}>{val}</div>
            <div style={{ color: "#666", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {scenarios.length > 0 && (
        <div style={{ padding: "4px 12px", borderBottom: `1px solid ${CY}22`, display: "flex", gap: 2, height: 6 }}>
          {[
            [readyCount, CY],
            [profileOnlyCount, GR],
            [dataOnlyCount, AM],
            [darkCount, RD],
          ].map(([cnt, color], i) => (
            <div
              key={i}
              style={{
                width: `${(cnt / scenarios.length) * 100}%`,
                background: color,
                height: "100%",
                transition: "width .3s",
                borderRadius: 1,
              }}
            />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "6px 12px", borderBottom: `1px solid ${CY}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}22` : "none",
              border: `1px solid ${tab === t ? CY : "#333"}`,
              color: tab === t ? CY : "#666",
              fontSize: 8,
              padding: "2px 6px",
              cursor: "pointer",
              borderRadius: 3,
              letterSpacing: 1,
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SEARCH SCENARIOS…"
          style={{
            marginLeft: "auto",
            background: "#111",
            border: `1px solid ${CY}44`,
            color: CY,
            fontSize: 9,
            padding: "2px 6px",
            borderRadius: 3,
            outline: "none",
            width: 160,
          }}
        />
      </div>

      {/* Scenario list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px" }}>
        {err && <div style={{ color: RD, fontSize: 9, padding: 8 }}>{err}</div>}
        {filtered.length === 0 && !loading && (
          <div style={{ color: "#555", fontSize: 9, padding: 12, textAlign: "center" }}>NO SCENARIOS MATCH</div>
        )}
        {filtered.map((sc, i) => {
          const cls = sc._class;
          const color = classColor(cls);
          const isExp = expanded === i;
          const mProfiles = isExp ? matchedProfiles(sc) : [];
          const mDatasets = isExp ? matchedDatasets(sc) : [];
          return (
            <div
              key={i}
              style={{ borderBottom: `1px solid ${CY}11`, padding: "5px 0" }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                onClick={() => setExpanded(isExp ? null : i)}
              >
                <span style={{ color: "#444", fontSize: 9, width: 24, flexShrink: 0 }}>
                  {isExp ? "▼" : "▶"}
                </span>
                <span style={{ color: "#ccc", fontSize: 10, flex: 1 }}>
                  {sc.title || sc.name || sc.id || `Scenario ${i + 1}`}
                </span>
                {chip(cls, color)}
                {sc.tags?.length > 0 && (
                  <span style={{ color: "#555", fontSize: 9 }}>{sc.tags.slice(0, 2).join(", ")}</span>
                )}
              </div>
              {isExp && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, paddingLeft: 30 }}>
                  {/* Matched intel profiles */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: GR, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      INTEL PROFILES
                    </div>
                    {mProfiles.length === 0 ? (
                      <div style={{ color: "#444", fontSize: 9 }}>no profiles matched</div>
                    ) : (
                      mProfiles.map(({ p, sc: score }, j) => (
                        <div key={j} style={{ marginBottom: 6 }}>
                          <div style={{ color: "#ccc", fontSize: 9, marginBottom: 2 }}>
                            {p.name || p.title || p.id || `Profile ${j + 1}`}
                          </div>
                          {p.category && chip(p.category.toUpperCase(), GR)}
                          <ScoreBar sc={score} color={GR} />
                        </div>
                      ))
                    )}
                  </div>
                  {/* Matched datasets */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: AM, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      DATASETS
                    </div>
                    {mDatasets.length === 0 ? (
                      <div style={{ color: "#444", fontSize: 9 }}>no datasets matched</div>
                    ) : (
                      mDatasets.map(({ d, sc: score }, j) => (
                        <div key={j} style={{ marginBottom: 6 }}>
                          <div style={{ color: "#ccc", fontSize: 9, marginBottom: 2 }}>
                            {d.name || d.title || d.id || `Dataset ${j + 1}`}
                          </div>
                          {d.category && chip(d.category.toUpperCase(), AM)}
                          <ScoreBar sc={score} color={AM} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${CY}22` }}>
        {assessText && (
          <div style={{ color: "#aaa", fontSize: 9, marginBottom: 6, lineHeight: 1.5 }}>
            {assessText}
          </div>
        )}
        <button
          onClick={assess}
          disabled={assessing || loading}
          style={{
            background: `${CY}22`,
            border: `1px solid ${CY}`,
            color: CY,
            fontSize: 9,
            padding: "4px 12px",
            cursor: assessing ? "wait" : "pointer",
            borderRadius: 3,
            letterSpacing: 1,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS SCENARIO INTELLIGENCE READINESS"}
        </button>
      </div>
    </div>
  );
}
