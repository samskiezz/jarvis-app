/**
 * DatasetLineageInspector — left-edge slide-in at 11% vertical.
 * Lists datasets via GET /v1/datasets (5-min poll).
 * Expanding a row fetches GET /v1/datasets/{name}/health (session-cached).
 * LINEAGE toggle fetches GET /v1/datasets/{name}/lineage (session-cached).
 * Connector count from GET /v1/connectors shown in header (once per open).
 */
import { useState, useEffect, useCallback, useRef } from "react";

const ACCENT = "#FB923C";
const POLL_MS = 5 * 60 * 1000;

function relAge(ts) {
  if (!ts) return "—";
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtFresh(ms) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(0)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

export default function DatasetLineageInspector() {
  const [open, setOpen] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [connectorCount, setConnectorCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [showLineage, setShowLineage] = useState(null);
  const [healthData, setHealthData] = useState({});
  const [lineageData, setLineageData] = useState({});
  const [fetchingHealth, setFetchingHealth] = useState({});
  const [fetchingLineage, setFetchingLineage] = useState({});
  const healthCache = useRef({});
  const lineageCache = useRef({});

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/v1/datasets");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setDatasets(Array.isArray(d.items) ? d.items : []);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConnectors = useCallback(async () => {
    try {
      const r = await fetch("/v1/connectors");
      if (!r.ok) return;
      const d = await r.json();
      setConnectorCount(Array.isArray(d.connectors) ? d.connectors.length : 0);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!open) return;
    loadDatasets();
    loadConnectors();
    const id = setInterval(loadDatasets, POLL_MS);
    return () => clearInterval(id);
  }, [open, loadDatasets, loadConnectors]);

  const fetchHealth = useCallback(async (name) => {
    if (healthCache.current[name]) {
      setHealthData((h) => ({ ...h, [name]: healthCache.current[name] }));
      return;
    }
    setFetchingHealth((f) => ({ ...f, [name]: true }));
    try {
      const r = await fetch(`/v1/datasets/${encodeURIComponent(name)}/health`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      healthCache.current[name] = d;
      setHealthData((h) => ({ ...h, [name]: d }));
    } catch (e) {
      const result = { error: e.message };
      healthCache.current[name] = result;
      setHealthData((h) => ({ ...h, [name]: result }));
    } finally {
      setFetchingHealth((f) => ({ ...f, [name]: false }));
    }
  }, []);

  const fetchLineage = useCallback(async (name) => {
    if (lineageCache.current[name]) {
      setLineageData((l) => ({ ...l, [name]: lineageCache.current[name] }));
      return;
    }
    setFetchingLineage((f) => ({ ...f, [name]: true }));
    try {
      const r = await fetch(`/v1/datasets/${encodeURIComponent(name)}/lineage`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      lineageCache.current[name] = d;
      setLineageData((l) => ({ ...l, [name]: d }));
    } catch (e) {
      const result = { error: e.message };
      lineageCache.current[name] = result;
      setLineageData((l) => ({ ...l, [name]: result }));
    } finally {
      setFetchingLineage((f) => ({ ...f, [name]: false }));
    }
  }, []);

  const toggleExpand = useCallback(
    (name) => {
      setExpanded((prev) => {
        const next = prev === name ? null : name;
        if (next) fetchHealth(name);
        return next;
      });
    },
    [fetchHealth]
  );

  const toggleLineage = useCallback(
    (e, name) => {
      e.stopPropagation();
      setShowLineage((prev) => {
        const next = prev === name ? null : name;
        if (next) fetchLineage(name);
        return next;
      });
    },
    [fetchLineage]
  );

  return (
    <>
      {/* Tab button */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Dataset Lineage Inspector"
        style={{
          position: "fixed",
          top: "11%",
          left: open ? 320 : 0,
          zIndex: 120,
          background: open ? ACCENT : "rgba(5,10,18,0.88)",
          border: `1px solid ${ACCENT}55`,
          borderLeft: "none",
          borderRadius: "0 6px 6px 0",
          padding: "6px 8px",
          cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          letterSpacing: 1,
          color: open ? "#0a0014" : ACCENT,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transition: "left 0.25s, background 0.2s",
          userSelect: "none",
        }}
      >
        LINEAGE ▶
      </div>

      {/* Slide-in panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: open ? 0 : -320,
          bottom: 0,
          width: 320,
          zIndex: 119,
          background: "rgba(5,8,16,0.97)",
          border: `1px solid ${ACCENT}33`,
          borderLeft: "none",
          boxShadow: open ? `4px 0 32px ${ACCENT}18` : "none",
          transition: "left 0.25s",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${ACCENT}22`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: `linear-gradient(90deg, ${ACCENT}11, transparent)`,
            flexShrink: 0,
          }}
        >
          <span style={{ color: ACCENT, fontSize: 11, letterSpacing: 2, flex: 1 }}>
            DATASET LINEAGE
            <span style={{ opacity: 0.6, marginLeft: 6, fontSize: 9 }}>
              {datasets.length > 0 && `${datasets.length} DS`}
              {connectorCount !== null && ` · ${connectorCount} CONN`}
            </span>
          </span>
          {loading && (
            <span style={{ color: ACCENT, opacity: 0.5, fontSize: 9 }}>LOADING</span>
          )}
          <span
            onClick={() => setOpen(false)}
            style={{
              color: "#4E6070",
              fontSize: 14,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            ×
          </span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {err && (
            <div
              style={{
                padding: "12px 16px",
                color: "#EF4444",
                fontSize: 10,
                letterSpacing: 1,
              }}
            >
              ERROR: {err}
            </div>
          )}
          {!err && datasets.length === 0 && !loading && (
            <div
              style={{
                padding: "24px 16px",
                color: "#4E6070",
                fontSize: 10,
                textAlign: "center",
                letterSpacing: 1,
              }}
            >
              NO DATASETS REGISTERED
            </div>
          )}

          {datasets.map((ds) => {
            const name = ds.name;
            const isExpanded = expanded === name;
            const isLineageOpen = showLineage === name;
            const health = healthData[name];
            const lineage = lineageData[name];
            const loadingH = fetchingHealth[name];
            const loadingL = fetchingLineage[name];

            return (
              <div key={name}>
                {/* Dataset row */}
                <div
                  onClick={() => toggleExpand(name)}
                  style={{
                    padding: "9px 16px",
                    cursor: "pointer",
                    borderBottom: `1px solid ${ACCENT}0F`,
                    background: isExpanded ? `${ACCENT}0A` : "transparent",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        color: "#0EA5E9",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: 1,
                        flexShrink: 0,
                        border: "1px solid #0EA5E944",
                        borderRadius: 3,
                        padding: "1px 4px",
                      }}
                    >
                      {(ds.source || "UNKNOWN").toUpperCase().slice(0, 12)}
                    </span>
                    <span
                      style={{
                        color: "#DCE8F0",
                        fontSize: 11,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {name}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span
                      style={{
                        color: "#4E6070",
                        fontSize: 9,
                        letterSpacing: 0.5,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ds.owner ? `owner: ${ds.owner}` : "no owner"}
                    </span>
                    <span
                      style={{
                        color: "#4E6070",
                        fontSize: 9,
                        letterSpacing: 0.5,
                        flexShrink: 0,
                      }}
                    >
                      {relAge(ds.created_ts)}
                    </span>
                  </div>
                </div>

                {/* Expanded: health + lineage */}
                {isExpanded && (
                  <div
                    style={{
                      background: "rgba(0,0,0,0.35)",
                      borderBottom: `1px solid ${ACCENT}22`,
                      padding: "10px 16px",
                    }}
                  >
                    {/* Health */}
                    {loadingH && (
                      <div
                        style={{
                          color: ACCENT,
                          fontSize: 9,
                          opacity: 0.6,
                          marginBottom: 8,
                        }}
                      >
                        FETCHING HEALTH…
                      </div>
                    )}
                    {health && !health.error && (
                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                          marginBottom: 10,
                        }}
                      >
                        <span
                          style={{ color: "#4E6070", fontSize: 9, letterSpacing: 0.5 }}
                        >
                          ROWS{" "}
                          <span style={{ color: ACCENT }}>{health.rows ?? "—"}</span>
                        </span>
                        <span
                          style={{ color: "#4E6070", fontSize: 9, letterSpacing: 0.5 }}
                        >
                          FRESH{" "}
                          <span
                            style={{
                              color:
                                health.freshness_ms !== null ? "#4ADE80" : "#4E6070",
                            }}
                          >
                            {fmtFresh(health.freshness_ms)}
                          </span>
                        </span>
                        <span
                          style={{ color: "#4E6070", fontSize: 9, letterSpacing: 0.5 }}
                        >
                          NULL{" "}
                          <span
                            style={{
                              color:
                                health.null_rate > 0 ? "#FCD34D" : "#4ADE80",
                            }}
                          >
                            {health.null_rate !== null
                              ? `${(health.null_rate * 100).toFixed(1)}%`
                              : "—"}
                          </span>
                        </span>
                        {health.series_id && (
                          <span
                            style={{
                              color: "#4E6070",
                              fontSize: 9,
                              letterSpacing: 0.5,
                            }}
                          >
                            SID{" "}
                            <span style={{ color: "#818CF8" }}>
                              {health.series_id.slice(0, 8)}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                    {health && health.error && (
                      <div
                        style={{ color: "#EF4444", fontSize: 9, marginBottom: 10 }}
                      >
                        HEALTH ERR: {health.error}
                      </div>
                    )}

                    {/* Lineage toggle */}
                    <button
                      onClick={(e) => toggleLineage(e, name)}
                      style={{
                        background: isLineageOpen ? `${ACCENT}22` : "transparent",
                        border: `1px solid ${ACCENT}44`,
                        borderRadius: 3,
                        color: ACCENT,
                        fontSize: 9,
                        letterSpacing: 1,
                        padding: "3px 8px",
                        cursor: "pointer",
                        fontFamily: "'JetBrains Mono',monospace",
                      }}
                    >
                      {isLineageOpen ? "HIDE LINEAGE" : "SHOW LINEAGE"}
                    </button>

                    {/* Lineage graph */}
                    {isLineageOpen && (
                      <div style={{ marginTop: 10 }}>
                        {loadingL && (
                          <div
                            style={{
                              color: ACCENT,
                              fontSize: 9,
                              opacity: 0.6,
                            }}
                          >
                            LOADING LINEAGE…
                          </div>
                        )}
                        {lineage && !lineage.error && (
                          <>
                            {/* Node chips */}
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 4,
                                marginBottom: 8,
                              }}
                            >
                              {(lineage.nodes || []).map((node, i) => (
                                <span
                                  key={i}
                                  style={{
                                    background:
                                      node === name
                                        ? `${ACCENT}22`
                                        : "rgba(255,255,255,0.05)",
                                    border: `1px solid ${
                                      node === name ? ACCENT : "#2E4050"
                                    }44`,
                                    borderRadius: 3,
                                    color:
                                      node === name ? ACCENT : "#8CA0B0",
                                    fontSize: 9,
                                    padding: "2px 6px",
                                    letterSpacing: 0.5,
                                  }}
                                >
                                  {node}
                                </span>
                              ))}
                            </div>

                            {/* Edge list */}
                            {(lineage.edges || []).length > 0 ? (
                              <div>
                                {lineage.edges.map((edge, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 4,
                                      marginBottom: 4,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <span
                                      style={{
                                        color: "#6B7E8F",
                                        fontSize: 9,
                                        maxWidth: 80,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {edge.input || edge.from || "?"}
                                    </span>
                                    <span
                                      style={{ color: ACCENT, fontSize: 9 }}
                                    >
                                      →
                                    </span>
                                    <span
                                      style={{
                                        color: "#818CF8",
                                        fontSize: 9,
                                        border: "1px solid #818CF822",
                                        borderRadius: 2,
                                        padding: "0 4px",
                                        flexShrink: 0,
                                      }}
                                    >
                                      {(
                                        edge.op ||
                                        edge.type ||
                                        "op"
                                      )
                                        .toUpperCase()
                                        .slice(0, 16)}
                                    </span>
                                    <span
                                      style={{ color: ACCENT, fontSize: 9 }}
                                    >
                                      →
                                    </span>
                                    <span
                                      style={{
                                        color: "#6B7E8F",
                                        fontSize: 9,
                                        maxWidth: 80,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {edge.output || edge.to || "?"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div
                                style={{
                                  color: "#4E6070",
                                  fontSize: 9,
                                  letterSpacing: 1,
                                }}
                              >
                                NO LINEAGE EDGES
                              </div>
                            )}
                          </>
                        )}
                        {lineage && lineage.error && (
                          <div style={{ color: "#EF4444", fontSize: 9 }}>
                            LINEAGE ERR: {lineage.error}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 16px",
            borderTop: `1px solid ${ACCENT}1A`,
            color: "#2E4050",
            fontSize: 9,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          GET /v1/datasets · /health · /lineage · 5-min poll
        </div>
      </div>
    </>
  );
}
