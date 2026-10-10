/**
 * F40 — Scenario × Dataset × Ops Event Readiness Matrix (SDORM)
 * Endpoints: /v1/scenario/list × /v1/datasets × /v1/ops/events
 * Classification: FULLY_READY | DATA_BACKED | OPS_BACKED | UNREADY
 * Identifies scenarios that lack data coverage or operational event backing.
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 932_400;
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

const SDORM_RE =
  /\b(sdorm|scenario\s*dataset\s*ops|scenario\s*readiness|scenario\s*data\s*coverage|scenario\s*operational|scenario\s*event\s*backing|unready\s*scenario|scenario\s*coverage\s*matrix|scenario\s*ops\s*event|scenario\s*dataset\s*readiness|scenario\s*data\s*ops)\b/i;

export function isSdormQuery(t) {
  return SDORM_RE.test(t || "");
}

// ── Normalisers ───────────────────────────────────────────────────────────────

function normaliseScenario(raw) {
  if (!raw) return null;
  return {
    id:       raw.id || raw.scenario_id || raw._id || String(Math.random()),
    title:    raw.title || raw.name || raw.label || raw.description || "Unnamed Scenario",
    status:   raw.status || raw.state || "",
    type:     raw.type || raw.category || "",
    tags:     Array.isArray(raw.tags) ? raw.tags : [],
    extra:    raw,
  };
}

function normaliseDataset(raw) {
  if (!raw) return null;
  return {
    id:    raw.id || raw.dataset_id || raw._id || String(Math.random()),
    title: raw.title || raw.name || raw.label || "Unnamed Dataset",
    type:  raw.type || raw.category || raw.dataset_type || "",
    rows:  raw.row_count ?? raw.rows ?? raw.count ?? null,
    tags:  Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function normaliseOpsEvent(raw) {
  if (!raw) return null;
  return {
    id:       raw.id || raw.event_id || raw._id || String(Math.random()),
    title:    raw.title || raw.name || raw.label || raw.description || raw.message || "Unnamed Event",
    severity: raw.severity || raw.level || raw.priority || "",
    type:     raw.type || raw.category || raw.event_type || "",
    tags:     Array.isArray(raw.tags) ? raw.tags : [],
    extra:    raw,
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
  FULLY_READY: {
    label: "FULLY READY",
    color: "#00ff88",
    desc:  "Scenario backed by both a Dataset AND an Ops Event",
  },
  DATA_BACKED: {
    label: "DATA BACKED",
    color: "#29e7ff",
    desc:  "Scenario has Dataset coverage but no matching Ops Event",
  },
  OPS_BACKED: {
    label: "OPS BACKED",
    color: "#ffaa00",
    desc:  "Scenario has Ops Event backing but no Dataset coverage",
  },
  UNREADY: {
    label: "UNREADY",
    color: "#ff3333",
    desc:  "Scenario lacks both Dataset and Ops Event backing — execution risk",
  },
};

function buildMatrix(scenarios, datasets, opsEvents) {
  return scenarios.map((scenario) => {
    const sKw = keywords(scenario);

    let bestDs      = null;
    let bestDsScore = 0;
    for (const ds of datasets) {
      const s = scoreMatch(sKw, keywords(ds));
      if (s > bestDsScore) { bestDsScore = s; bestDs = ds; }
    }

    let bestOps      = null;
    let bestOpsScore = 0;
    for (const ev of opsEvents) {
      const s = scoreMatch(sKw, keywords(ev));
      if (s > bestOpsScore) { bestOpsScore = s; bestOps = ev; }
    }

    const hasDs  = bestDs  && bestDsScore  > 0;
    const hasOps = bestOps && bestOpsScore > 0;

    const cls =
      hasDs && hasOps ? "FULLY_READY"
      : hasDs         ? "DATA_BACKED"
      : hasOps        ? "OPS_BACKED"
                      : "UNREADY";

    return {
      scenario,
      ds: hasDs ? bestDs : null, dsScore: bestDsScore,
      ops: hasOps ? bestOps : null, opsScore: bestOpsScore,
      cls,
    };
  });
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };

  const [scRaw, dsRaw, evRaw] = await Promise.all([
    fetch(`${base}/v1/scenario/list`, { headers: hdr }).then((r) => r.ok ? r.json() : []),
    fetch(`${base}/v1/datasets`,      { headers: hdr }).then((r) => r.ok ? r.json() : []),
    fetch(`${base}/v1/ops/events`,    { headers: hdr }).then((r) => r.ok ? r.json() : []),
  ]);

  const scenarios = (Array.isArray(scRaw) ? scRaw : scRaw?.data ?? scRaw?.scenarios ?? scRaw?.items ?? [])
    .map(normaliseScenario).filter(Boolean);
  const datasets = (Array.isArray(dsRaw) ? dsRaw : dsRaw?.data ?? dsRaw?.datasets ?? dsRaw?.items ?? [])
    .map(normaliseDataset).filter(Boolean);
  const opsEvents = (Array.isArray(evRaw) ? evRaw : evRaw?.data ?? evRaw?.events ?? evRaw?.items ?? [])
    .map(normaliseOpsEvent).filter(Boolean);

  return { scenarios, datasets, opsEvents };
}

export async function buildSdormScript() {
  try {
    const { scenarios, datasets, opsEvents } = await fetchAll();
    const rows   = buildMatrix(scenarios, datasets, opsEvents);
    const counts = {
      FULLY_READY: rows.filter((r) => r.cls === "FULLY_READY").length,
      DATA_BACKED: rows.filter((r) => r.cls === "DATA_BACKED").length,
      OPS_BACKED:  rows.filter((r) => r.cls === "OPS_BACKED").length,
      UNREADY:     rows.filter((r) => r.cls === "UNREADY").length,
    };
    return (
      `Scenario Dataset Ops Readiness: ${scenarios.length} scenarios cross-referenced against ` +
      `${datasets.length} datasets and ${opsEvents.length} ops events. ` +
      `Fully ready (dataset + ops event): ${counts.FULLY_READY}. ` +
      `Data backed only: ${counts.DATA_BACKED}. ` +
      `Ops backed only: ${counts.OPS_BACKED}. ` +
      `Unready (no data or ops backing): ${counts.UNREADY} — scenarios with execution risk.`
    );
  } catch (e) {
    return `Scenario Dataset Ops Readiness unavailable: ${e.message}`;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScenarioDatasetOpsReadiness() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [counts,   setCounts]   = useState({ FULLY_READY: 0, DATA_BACKED: 0, OPS_BACKED: 0, UNREADY: 0 });
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState(null);
  const [filter,   setFilter]   = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      setOpen((v) => (e.detail?.force !== undefined ? e.detail.force : !v));
    }
    window.addEventListener("jarvis:sdorm-toggle", handler);
    return () => window.removeEventListener("jarvis:sdorm-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    async function load() {
      setLoading(true); setErr(null);
      try {
        const { scenarios, datasets, opsEvents } = await fetchAll();
        const matrix = buildMatrix(scenarios, datasets, opsEvents);
        setRows(matrix);
        setCounts({
          FULLY_READY: matrix.filter((r) => r.cls === "FULLY_READY").length,
          DATA_BACKED: matrix.filter((r) => r.cls === "DATA_BACKED").length,
          OPS_BACKED:  matrix.filter((r) => r.cls === "OPS_BACKED").length,
          UNREADY:     matrix.filter((r) => r.cls === "UNREADY").length,
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
        r.scenario.title.toLowerCase().includes(q) ||
        r.scenario.status.toLowerCase().includes(q) ||
        (r.ds?.title  || "").toLowerCase().includes(q) ||
        (r.ops?.title || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const unreadyBadge = counts.UNREADY;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position:    "fixed",
          bottom:      8,
          left:        BTN_LEFT,
          zIndex:      628,
          fontFamily:  "monospace",
          fontSize:    10,
          padding:     "2px 7px",
          background:  open ? "#0f0805" : "#0a0a0a",
          color:       open ? "#ff9933" : "#555",
          border:      `1px solid ${open ? "#ff9933" : "#333"}`,
          borderRadius: 3,
          cursor:      "pointer",
          whiteSpace:  "nowrap",
          animation:   unreadyBadge > 0 ? "jarvisPulse 2s infinite" : "none",
        }}
        title="Scenario × Dataset × Ops Event Readiness Matrix"
      >
        SDORM{unreadyBadge > 0 ? ` [${unreadyBadge}]` : ""}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position:      "fixed",
            bottom:        36,
            left:          BTN_LEFT - 200,
            width:         940,
            maxHeight:     580,
            zIndex:        628,
            background:    "#0f0805",
            border:        "1px solid #ff9933",
            borderRadius:  6,
            fontFamily:    "monospace",
            fontSize:      11,
            color:         "#ccc",
            display:       "flex",
            flexDirection: "column",
            overflow:      "hidden",
            boxShadow:     "0 0 24px #ff993344",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding:      "6px 12px",
              borderBottom: "1px solid #ff993344",
              display:      "flex",
              alignItems:   "center",
              gap:          8,
              flexShrink:   0,
            }}
          >
            <span style={{ color: "#ff9933", fontWeight: "bold", fontSize: 12 }}>SDORM</span>
            <span style={{ color: "#555", fontSize: 10 }}>
              Scenario × Dataset × Ops Event Readiness Matrix
            </span>
            {loading && (
              <span style={{ color: "#ff9933", marginLeft: "auto", fontSize: 10 }}>LOADING…</span>
            )}
            {err && (
              <span style={{ color: "#f55", marginLeft: "auto", fontSize: 10 }}>ERR: {err}</span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
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
              borderBottom: "1px solid #ff993322",
            }}
          >
            {Object.entries(CLASS_META).map(([k, meta]) => (
              <div
                key={k}
                onClick={() => setFilter(filter === k ? "ALL" : k)}
                style={{
                  flex:         1,
                  background:   filter === k ? "#1a0e05" : "#111",
                  border:       `1px solid ${filter === k ? meta.color : "#333"}`,
                  borderRadius: 4,
                  padding:      "4px 6px",
                  cursor:       "pointer",
                  textAlign:    "center",
                }}
              >
                <div style={{ color: meta.color, fontSize: 16, fontWeight: "bold" }}>{counts[k]}</div>
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
              borderBottom: "1px solid #ff993322",
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search scenarios / datasets / ops events…"
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
            <span style={{ color: "#555", fontSize: 10 }}>{visible.length}/{rows.length}</span>
          </div>

          {/* Rows */}
          <div style={{ overflow: "auto", flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: 16, color: "#444", textAlign: "center" }}>
                {err ? "Error loading data." : "No scenarios match."}
              </div>
            )}
            {visible.map((row, i) => {
              const meta       = CLASS_META[row.cls];
              const isExpanded = expanded === (row.scenario.id + i);
              return (
                <div key={row.scenario.id + i} style={{ borderBottom: "1px solid #1a0e05" }}>
                  {/* Row summary */}
                  <div
                    onClick={() => setExpanded(isExpanded ? null : row.scenario.id + i)}
                    style={{
                      padding:             "5px 12px",
                      display:             "grid",
                      gridTemplateColumns: "130px 1fr 1fr 1fr",
                      gap:                 6,
                      alignItems:          "start",
                      cursor:              "pointer",
                    }}
                  >
                    {/* Badge */}
                    <div>
                      <span
                        style={{
                          display:      "inline-block",
                          padding:      "1px 4px",
                          borderRadius: 2,
                          background:   "#0f0805",
                          border:       `1px solid ${meta.color}`,
                          color:        meta.color,
                          fontSize:     9,
                          whiteSpace:   "nowrap",
                        }}
                      >
                        {meta.label}
                      </span>
                      {row.scenario.type && (
                        <div style={{ color: "#555", fontSize: 9, marginTop: 2 }}>{row.scenario.type}</div>
                      )}
                    </div>

                    {/* Scenario */}
                    <div>
                      <div style={{ color: "#ff9933", fontSize: 10, fontWeight: "bold" }}>
                        {row.scenario.title}
                      </div>
                      {row.scenario.status && (
                        <div style={{ color: "#555", fontSize: 9 }}>{row.scenario.status}</div>
                      )}
                    </div>

                    {/* Dataset */}
                    <div>
                      {row.ds ? (
                        <>
                          <div style={{ color: "#29e7ff", fontSize: 10 }}>{row.ds.title}</div>
                          <div style={{ color: "#555", fontSize: 9 }}>
                            dataset · score {row.dsScore}
                            {row.ds.rows != null ? ` · ${row.ds.rows} rows` : ""}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: "#333", fontSize: 10 }}>— no dataset</div>
                      )}
                    </div>

                    {/* Ops Event */}
                    <div>
                      {row.ops ? (
                        <>
                          <div style={{ color: "#00ff88", fontSize: 10 }}>{row.ops.title}</div>
                          <div style={{ color: "#555", fontSize: 9 }}>
                            ops · score {row.opsScore}
                            {row.ops.severity ? ` · ${row.ops.severity}` : ""}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: "#333", fontSize: 10 }}>— no ops event</div>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      style={{
                        padding:    "6px 12px 8px",
                        background: "#150d04",
                        display:    "flex",
                        gap:        12,
                      }}
                    >
                      {/* Dataset bar */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#29e7ff", fontSize: 9, marginBottom: 3 }}>DATASET</div>
                        {row.ds ? (
                          <>
                            <div style={{ height: 6, borderRadius: 2, background: "#001a1a", overflow: "hidden", marginBottom: 3 }}>
                              <div style={{ width: `${Math.min(100, row.dsScore * 10)}%`, height: "100%", background: "#29e7ff" }} />
                            </div>
                            <div style={{ color: "#777", fontSize: 9 }}>
                              {row.ds.title}
                              {row.ds.type  ? ` · ${row.ds.type}` : ""}
                              {row.ds.rows != null ? ` · ${row.ds.rows} rows` : ""}
                            </div>
                          </>
                        ) : (
                          <div style={{ color: "#333", fontSize: 9 }}>no matching dataset</div>
                        )}
                      </div>

                      {/* Ops Event bar */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#00ff88", fontSize: 9, marginBottom: 3 }}>OPS EVENT</div>
                        {row.ops ? (
                          <>
                            <div style={{ height: 6, borderRadius: 2, background: "#001a08", overflow: "hidden", marginBottom: 3 }}>
                              <div style={{ width: `${Math.min(100, row.opsScore * 10)}%`, height: "100%", background: "#00ff88" }} />
                            </div>
                            <div style={{ color: "#777", fontSize: 9 }}>
                              {row.ops.title}
                              {row.ops.severity ? ` · ${row.ops.severity}` : ""}
                              {row.ops.type     ? ` · ${row.ops.type}` : ""}
                            </div>
                          </>
                        ) : (
                          <div style={{ color: "#333", fontSize: 9 }}>no matching ops event</div>
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
              borderTop:      "1px solid #ff993322",
              color:          "#444",
              fontSize:       9,
              flexShrink:     0,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
            }}
          >
            <span>/v1/scenario/list × /v1/datasets × /v1/ops/events · poll {POLL_MS / 1000}s</span>
            <button
              onClick={async () => {
                try {
                  const script = await buildSdormScript();
                  const base   = apiBase();
                  const resp   = await fetch(`${base}/v1/jarvis/agent/chat`, {
                    method:  "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
                    body:    JSON.stringify({ message: script }),
                  });
                  if (resp.ok) {
                    const data = await resp.json();
                    const text =
                      data.response || data.message || data.content ||
                      (typeof data === "string" ? data : JSON.stringify(data));
                    window.dispatchEvent(new CustomEvent("jarvis:speak", { detail: { text } }));
                  }
                } catch (_) {}
              }}
              style={{
                background:   "#1a0e05",
                border:       "1px solid #ff9933",
                color:        "#ff9933",
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
