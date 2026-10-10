/**
 * F37 — SwarmJob × IntelProfile × Scenario Intelligence Autonomy Index (SJIA)
 * Endpoints: /entities/SwarmJob × /entities/IntelProfile × /v1/scenario/list
 * Classification: FULLY_AUTONOMOUS | INTEL_ONLY | SCENARIO_ONLY | BLIND
 * Identifies automation that has both intelligence and scenario coverage vs. blind automation.
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 929_820;
const POLL_MS  = 90_000;

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

const SJIA_RE =
  /\b(sjia|swarm\s*intel\s*scenario|swarm\s*autonomy|intelligence\s*autonomy|automation\s*intel|swarm\s*intelligence\s*index|swarm\s*scenario\s*coverage|blind\s*swarm|swarm\s*blind\s*spot|autonomous\s*swarm|swarm\s*intel\s*coverage|swarm\s*backed|swarm\s*backing|job\s*intel\s*scenario|swarm\s*intel\s*profile|swarm\s*fully\s*autonomous)\b/i;

export function isSjiaQuery(t) {
  return SJIA_RE.test(t || "");
}

// ── Normalisers ───────────────────────────────────────────────────────────────

function normaliseSwarmJob(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.job_id || raw._id || String(Math.random()),
    title: raw.name || raw.title || raw.label || raw.job_name || "Unnamed Job",
    status: raw.status || raw.state || "",
    type: raw.type || raw.category || raw.job_type || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function normaliseIntelProfile(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.profile_id || raw._id || String(Math.random()),
    title: raw.name || raw.title || raw.subject || raw.label || "Unnamed Profile",
    role: raw.role || raw.type || raw.category || "",
    confidence: raw.confidence || raw.score || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function normaliseScenario(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.scenario_id || raw._id || String(Math.random()),
    title: raw.name || raw.title || raw.label || raw.scenario_name || "Unnamed Scenario",
    type: raw.type || raw.category || raw.class || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

// ── Keyword scoring ───────────────────────────────────────────────────────────

function keywords(obj) {
  const txt = JSON.stringify(obj || "").toLowerCase();
  return txt.match(/[a-z]{4,}/g) || [];
}

function scoreMatch(aKw, bKw) {
  const setB = new Set(bKw);
  return aKw.filter((w) => w.length > 3 && setB.has(w)).length;
}

// ── Classification ─────────────────────────────────────────────────────────────

const CLASS_META = {
  FULLY_AUTONOMOUS: {
    label: "FULLY AUTONOMOUS",
    color: "#00ff88",
    desc: "SwarmJob backed by both IntelProfile AND Scenario",
  },
  INTEL_ONLY: {
    label: "INTEL ONLY",
    color: "#ffaa00",
    desc: "SwarmJob matched to IntelProfile but no Scenario",
  },
  SCENARIO_ONLY: {
    label: "SCENARIO ONLY",
    color: "#00cfff",
    desc: "SwarmJob matched to Scenario but no IntelProfile",
  },
  BLIND: {
    label: "BLIND",
    color: "#ff3333",
    desc: "SwarmJob with no IntelProfile or Scenario backing",
  },
};

function buildMatrix(jobs, profiles, scenarios) {
  return jobs.map((job) => {
    const jKw = keywords(job);

    let bestProfile = null;
    let bestProfileScore = 0;
    for (const p of profiles) {
      const s = scoreMatch(jKw, keywords(p));
      if (s > bestProfileScore) {
        bestProfileScore = s;
        bestProfile = p;
      }
    }

    let bestScenario = null;
    let bestScenarioScore = 0;
    for (const sc of scenarios) {
      const s = scoreMatch(jKw, keywords(sc));
      if (s > bestScenarioScore) {
        bestScenarioScore = s;
        bestScenario = sc;
      }
    }

    const hasProfile  = bestProfile  && bestProfileScore  > 0;
    const hasScenario = bestScenario && bestScenarioScore > 0;

    const cls =
      hasProfile && hasScenario
        ? "FULLY_AUTONOMOUS"
        : hasProfile
        ? "INTEL_ONLY"
        : hasScenario
        ? "SCENARIO_ONLY"
        : "BLIND";

    return {
      job,
      profile:       hasProfile  ? bestProfile  : null,
      profileScore:  bestProfileScore,
      scenario:      hasScenario ? bestScenario : null,
      scenarioScore: bestScenarioScore,
      cls,
    };
  });
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };

  const [jRaw, pRaw, sRaw] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`,    { headers: hdr }).then((r) => r.ok ? r.json() : []),
    fetch(`${base}/entities/IntelProfile`, { headers: hdr }).then((r) => r.ok ? r.json() : []),
    fetch(`${base}/v1/scenario/list`,     { headers: hdr }).then((r) => r.ok ? r.json() : []),
  ]);

  const jobs = (Array.isArray(jRaw) ? jRaw : jRaw?.data ?? jRaw?.jobs ?? [])
    .map(normaliseSwarmJob).filter(Boolean);
  const profiles = (Array.isArray(pRaw) ? pRaw : pRaw?.data ?? pRaw?.profiles ?? [])
    .map(normaliseIntelProfile).filter(Boolean);
  const scenarios = (Array.isArray(sRaw) ? sRaw : sRaw?.data ?? sRaw?.scenarios ?? [])
    .map(normaliseScenario).filter(Boolean);

  return { jobs, profiles, scenarios };
}

export async function buildSjiaScript() {
  try {
    const { jobs, profiles, scenarios } = await fetchAll();
    const rows   = buildMatrix(jobs, profiles, scenarios);
    const counts = {
      FULLY_AUTONOMOUS: rows.filter((r) => r.cls === "FULLY_AUTONOMOUS").length,
      INTEL_ONLY:       rows.filter((r) => r.cls === "INTEL_ONLY").length,
      SCENARIO_ONLY:    rows.filter((r) => r.cls === "SCENARIO_ONLY").length,
      BLIND:            rows.filter((r) => r.cls === "BLIND").length,
    };
    return (
      `Swarm Intelligence Autonomy Index: ${jobs.length} swarm jobs cross-referenced against ` +
      `${profiles.length} intel profiles and ${scenarios.length} scenarios. ` +
      `Fully autonomous (intel + scenario): ${counts.FULLY_AUTONOMOUS}. ` +
      `Intel only: ${counts.INTEL_ONLY}. ` +
      `Scenario only: ${counts.SCENARIO_ONLY}. ` +
      `Blind (no backing): ${counts.BLIND}.`
    );
  } catch (e) {
    return `Swarm Intelligence Autonomy Index unavailable: ${e.message}`;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SwarmIntelScenarioAutonomy() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState([]);
  const [counts,  setCounts]  = useState({
    FULLY_AUTONOMOUS: 0,
    INTEL_ONLY: 0,
    SCENARIO_ONLY: 0,
    BLIND: 0,
  });
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [filter,  setFilter]  = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [expanded, setExpanded] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      setOpen((v) => (e.detail?.force !== undefined ? e.detail.force : !v));
    }
    window.addEventListener("jarvis:sjia-toggle", handler);
    return () => window.removeEventListener("jarvis:sjia-toggle", handler);
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
        const { jobs, profiles, scenarios } = await fetchAll();
        const matrix = buildMatrix(jobs, profiles, scenarios);
        setRows(matrix);
        setCounts({
          FULLY_AUTONOMOUS: matrix.filter((r) => r.cls === "FULLY_AUTONOMOUS").length,
          INTEL_ONLY:       matrix.filter((r) => r.cls === "INTEL_ONLY").length,
          SCENARIO_ONLY:    matrix.filter((r) => r.cls === "SCENARIO_ONLY").length,
          BLIND:            matrix.filter((r) => r.cls === "BLIND").length,
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
        r.job.title.toLowerCase().includes(q) ||
        r.job.type.toLowerCase().includes(q) ||
        (r.profile?.title  || "").toLowerCase().includes(q) ||
        (r.scenario?.title || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const blindBadge = counts.BLIND;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position:   "fixed",
          bottom:     8,
          left:       BTN_LEFT,
          zIndex:     625,
          fontFamily: "monospace",
          fontSize:   10,
          padding:    "2px 7px",
          background: open ? "#080f08" : "#0a0a0a",
          color:      open ? "#00ff88" : "#555",
          border:     `1px solid ${open ? "#00ff88" : "#333"}`,
          borderRadius: 3,
          cursor:     "pointer",
          whiteSpace: "nowrap",
          animation:  blindBadge > 0 ? "jarvisPulse 2s infinite" : "none",
        }}
        title="SwarmJob × IntelProfile × Scenario Intelligence Autonomy Index"
      >
        SJIA{blindBadge > 0 ? ` [${blindBadge}]` : ""}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position:    "fixed",
            bottom:      36,
            left:        BTN_LEFT - 200,
            width:       900,
            maxHeight:   580,
            zIndex:      625,
            background:  "#080f08",
            border:      "1px solid #00ff88",
            borderRadius: 6,
            fontFamily:  "monospace",
            fontSize:    11,
            color:       "#ccc",
            display:     "flex",
            flexDirection: "column",
            overflow:    "hidden",
            boxShadow:   "0 0 24px #00ff8844",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding:      "6px 12px",
              borderBottom: "1px solid #00ff8844",
              display:      "flex",
              alignItems:   "center",
              gap:          8,
              flexShrink:   0,
            }}
          >
            <span style={{ color: "#00ff88", fontWeight: "bold", fontSize: 12 }}>
              SJIA
            </span>
            <span style={{ color: "#555", fontSize: 10 }}>
              SwarmJob × IntelProfile × Scenario Intelligence Autonomy Index
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
                marginLeft:  "auto",
                background:  "none",
                border:      "none",
                color:       "#666",
                cursor:      "pointer",
                fontSize:    14,
                lineHeight:  1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display:      "flex",
              gap:          6,
              padding:      "6px 12px",
              flexShrink:   0,
              borderBottom: "1px solid #00ff8822",
            }}
          >
            {Object.entries(CLASS_META).map(([k, meta]) => (
              <div
                key={k}
                onClick={() => setFilter(filter === k ? "ALL" : k)}
                style={{
                  flex:         1,
                  background:   filter === k ? "#0d1a0d" : "#111",
                  border:       `1px solid ${filter === k ? meta.color : "#333"}`,
                  borderRadius: 4,
                  padding:      "4px 6px",
                  cursor:       "pointer",
                  textAlign:    "center",
                }}
              >
                <div style={{ color: meta.color, fontSize: 16, fontWeight: "bold" }}>
                  {counts[k]}
                </div>
                <div style={{ color: "#666", fontSize: 9 }}>{meta.label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div
            style={{
              padding:      "4px 12px",
              flexShrink:   0,
              display:      "flex",
              gap:          8,
              alignItems:   "center",
              borderBottom: "1px solid #00ff8822",
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search swarm jobs / intel profiles / scenarios…"
              style={{
                flex:         1,
                background:   "#111",
                border:       "1px solid #333",
                borderRadius: 3,
                color:        "#ccc",
                fontFamily:   "monospace",
                fontSize:     10,
                padding:      "2px 6px",
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
                {err ? "Error loading data." : "No swarm jobs match."}
              </div>
            )}
            {visible.map((row, i) => {
              const meta = CLASS_META[row.cls];
              const isExpanded = expanded === (row.job.id + i);
              return (
                <div
                  key={row.job.id + i}
                  style={{ borderBottom: "1px solid #0d1a0d" }}
                >
                  {/* Row summary */}
                  <div
                    onClick={() =>
                      setExpanded(isExpanded ? null : row.job.id + i)
                    }
                    style={{
                      padding:             "5px 12px",
                      display:             "grid",
                      gridTemplateColumns: "110px 1fr 1fr 1fr",
                      gap:                 6,
                      alignItems:          "start",
                      cursor:              "pointer",
                    }}
                  >
                    {/* Classification badge */}
                    <div>
                      <span
                        style={{
                          display:      "inline-block",
                          padding:      "1px 4px",
                          borderRadius: 2,
                          background:   "#080f08",
                          border:       `1px solid ${meta.color}`,
                          color:        meta.color,
                          fontSize:     9,
                          whiteSpace:   "nowrap",
                        }}
                      >
                        {meta.label}
                      </span>
                      {row.job.status && (
                        <div style={{ color: "#555", fontSize: 9, marginTop: 2 }}>
                          {row.job.status}
                        </div>
                      )}
                    </div>

                    {/* Swarm job */}
                    <div>
                      <div style={{ color: "#00ff88", fontSize: 10, fontWeight: "bold" }}>
                        {row.job.title}
                      </div>
                      {row.job.type && (
                        <div style={{ color: "#555", fontSize: 9 }}>{row.job.type}</div>
                      )}
                    </div>

                    {/* Intel profile match */}
                    <div>
                      {row.profile ? (
                        <>
                          <div style={{ color: "#ffaa00", fontSize: 10 }}>
                            {row.profile.title}
                          </div>
                          <div style={{ color: "#555", fontSize: 9 }}>
                            intel · score {row.profileScore}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: "#333", fontSize: 10 }}>— no intel</div>
                      )}
                    </div>

                    {/* Scenario match */}
                    <div>
                      {row.scenario ? (
                        <>
                          <div style={{ color: "#00cfff", fontSize: 10 }}>
                            {row.scenario.title}
                          </div>
                          <div style={{ color: "#555", fontSize: 9 }}>
                            scenario · score {row.scenarioScore}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: "#333", fontSize: 10 }}>— no scenario</div>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      style={{
                        padding:      "6px 12px 8px",
                        background:   "#0a100a",
                        display:      "flex",
                        gap:          12,
                      }}
                    >
                      {/* Intel profile bar */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#ffaa00", fontSize: 9, marginBottom: 3 }}>
                          INTEL PROFILE
                        </div>
                        {row.profile ? (
                          <>
                            <div
                              style={{
                                height:       6,
                                borderRadius: 2,
                                background:   "#1a1200",
                                overflow:     "hidden",
                                marginBottom: 3,
                              }}
                            >
                              <div
                                style={{
                                  width:        `${Math.min(100, row.profileScore * 10)}%`,
                                  height:       "100%",
                                  background:   "#ffaa00",
                                }}
                              />
                            </div>
                            <div style={{ color: "#777", fontSize: 9 }}>
                              {row.profile.title}
                              {row.profile.role ? ` · ${row.profile.role}` : ""}
                              {row.profile.confidence ? ` · conf ${row.profile.confidence}` : ""}
                            </div>
                          </>
                        ) : (
                          <div style={{ color: "#333", fontSize: 9 }}>no matching intel profile</div>
                        )}
                      </div>

                      {/* Scenario bar */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#00cfff", fontSize: 9, marginBottom: 3 }}>
                          SCENARIO
                        </div>
                        {row.scenario ? (
                          <>
                            <div
                              style={{
                                height:       6,
                                borderRadius: 2,
                                background:   "#001a1a",
                                overflow:     "hidden",
                                marginBottom: 3,
                              }}
                            >
                              <div
                                style={{
                                  width:      `${Math.min(100, row.scenarioScore * 10)}%`,
                                  height:     "100%",
                                  background: "#00cfff",
                                }}
                              />
                            </div>
                            <div style={{ color: "#777", fontSize: 9 }}>
                              {row.scenario.title}
                              {row.scenario.type ? ` · ${row.scenario.type}` : ""}
                            </div>
                          </>
                        ) : (
                          <div style={{ color: "#333", fontSize: 9 }}>no matching scenario</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer / ASSESS */}
          <div
            style={{
              padding:        "4px 12px",
              borderTop:      "1px solid #00ff8822",
              color:          "#444",
              fontSize:       9,
              flexShrink:     0,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
            }}
          >
            <span>/entities/SwarmJob × /entities/IntelProfile × /v1/scenario/list · poll {POLL_MS / 1000}s</span>
            <button
              onClick={async () => {
                try {
                  const script = await buildSjiaScript();
                  const base   = apiBase();
                  const resp   = await fetch(`${base}/v1/jarvis/agent/chat`, {
                    method:  "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization:  `Bearer ${API_KEY}`,
                    },
                    body: JSON.stringify({ message: script }),
                  });
                  if (resp.ok) {
                    const data = await resp.json();
                    const text =
                      data.response || data.message || data.content ||
                      (typeof data === "string" ? data : JSON.stringify(data));
                    window.dispatchEvent(
                      new CustomEvent("jarvis:speak", { detail: { text } })
                    );
                  }
                } catch (_) {}
              }}
              style={{
                background:   "#0d1a0d",
                border:       "1px solid #00ff88",
                color:        "#00ff88",
                fontFamily:   "monospace",
                fontSize:     9,
                padding:      "2px 8px",
                borderRadius: 2,
                cursor:       "pointer",
              }}
            >
              ▶ ASSESS
            </button>
          </div>
        </div>
      )}
    </>
  );
}
