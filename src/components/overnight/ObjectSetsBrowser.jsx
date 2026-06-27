/**
 * ObjectSetsBrowser — F143
 * Right-edge slide-in drawer showing all saved ontology object sets from
 * GET /v1/ontology-ext/sets (5-min poll).
 *
 * Each row shows: set name, query type badge, relative creation age.
 * Clicking a row resolves it live via GET /v1/ontology-ext/sets/{id}/resolve
 * and expands up to 8 member objects inline (type chip + label).
 *
 * Accent: blue-300 (#93C5FD). Tab: right-edge at 25% from top.
 * Mount point: src/Layout.jsx after <IncidentCorrelationDrawer />.
 */
import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const POLL_MS = 300_000; // 5 minutes
const ACCENT = "#93C5FD";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function relTime(ts_s) {
  if (!ts_s) return "—";
  const diff = Math.floor(Date.now() / 1000 - ts_s);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function typeColor(t) {
  const m = {
    RiskSignal: "#EF4444",
    IntelProfile: "#F97316",
    Task: "#EAB308",
    Contact: "#22D3EE",
    Investment: "#F59E0B",
    SwarmJob: "#34D399",
    Document: "#A78BFA",
    Note: "#38BDF8",
  };
  return m[t] || "#6E8AA0";
}

export default function ObjectSetsBrowser() {
  const [open, setOpen] = useState(false);
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [resolveCache, setResolveCache] = useState({});
  const [resolving, setResolving] = useState(null);
  const timerRef = useRef(null);

  async function fetchSets() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBase()}/v1/ontology-ext/sets`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const items = Array.isArray(d) ? d : d.items || d.sets || [];
      setSets(items);
    } catch (e) {
      setError(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }

  async function resolveSet(id) {
    if (resolveCache[id]) {
      setExpanded(expanded === id ? null : id);
      return;
    }
    setResolving(id);
    try {
      const r = await fetch(`${apiBase()}/v1/ontology-ext/sets/${id}/resolve`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setResolveCache((prev) => ({ ...prev, [id]: d }));
      setExpanded(expanded === id ? null : id);
    } catch (e) {
      setResolveCache((prev) => ({ ...prev, [id]: { ok: false, error: e.message, items: [] } }));
      setExpanded(expanded === id ? null : id);
    } finally {
      setResolving(null);
    }
  }

  function handleRowClick(id) {
    if (expanded === id) {
      setExpanded(null);
    } else {
      resolveSet(id);
    }
  }

  useEffect(() => {
    fetchSets();
    timerRef.current = setInterval(fetchSets, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, []);

  const tabStyle = {
    position: "fixed",
    right: 0,
    top: "25%",
    transform: "translateY(-50%) rotate(90deg) translateX(50%)",
    transformOrigin: "right center",
    zIndex: 200,
    background: "rgba(8,14,22,0.85)",
    color: ACCENT,
    border: `1px solid ${ACCENT}55`,
    borderRadius: "0 0 6px 6px",
    padding: "4px 12px",
    fontSize: 10,
    letterSpacing: 2,
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: "nowrap",
  };

  const panelStyle = {
    position: "fixed",
    right: open ? 0 : -360,
    top: 0,
    height: "100vh",
    width: 340,
    background: "rgba(6,10,18,0.97)",
    borderLeft: `1px solid ${ACCENT}44`,
    boxShadow: open ? `-4px 0 40px ${ACCENT}22` : "none",
    zIndex: 199,
    overflowY: "auto",
    transition: "right 0.28s ease",
    fontFamily: "'JetBrains Mono', monospace",
    padding: "0 0 60px",
  };

  return (
    <>
      <button onClick={() => setOpen((v) => !v)} style={tabStyle} title="Object Sets Browser">
        SETS ▶
      </button>

      <div style={panelStyle}>
        {/* Header */}
        <div style={{
          position: "sticky", top: 0,
          background: "rgba(6,10,18,0.98)",
          borderBottom: `1px solid ${ACCENT}33`,
          padding: "14px 16px 10px",
          zIndex: 1,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ color: ACCENT, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              OBJECT SETS
            </span>
            <span style={{
              padding: "1px 7px", borderRadius: 10, fontSize: 10,
              background: `${ACCENT}22`, color: ACCENT,
              border: `1px solid ${ACCENT}44`,
            }}>
              {sets.length}
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16 }}
            >✕</button>
          </div>
          <div style={{ color: "#4A6278", fontSize: 10 }}>
            {loading ? "loading…" : error ? `error: ${error}` : `saved ontology sets · click to resolve`}
          </div>
        </div>

        {/* Set list */}
        <div style={{ padding: "8px 0" }}>
          {sets.length === 0 && !loading && (
            <div style={{ color: "#4A6278", fontSize: 11, padding: "16px" }}>
              {error ? `fetch error: ${error}` : "NO OBJECT SETS DEFINED"}
            </div>
          )}

          {sets.map((s) => {
            const isExpanded = expanded === s.id;
            const resolved = resolveCache[s.id];
            const queryType = s.query?.type || null;
            const isResolving = resolving === s.id;

            return (
              <div key={s.id} style={{ borderBottom: `1px solid #0D1824` }}>
                {/* Row */}
                <div
                  onClick={() => handleRowClick(s.id)}
                  style={{
                    padding: "9px 16px",
                    cursor: "pointer",
                    background: isExpanded ? `${ACCENT}0A` : "transparent",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{
                    flex: 1,
                    color: "#C8DCE8",
                    fontSize: 11,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {s.name || s.id}
                  </span>

                  {queryType && (
                    <span style={{
                      padding: "1px 6px", borderRadius: 3, fontSize: 9, letterSpacing: 1,
                      background: `${typeColor(queryType)}22`,
                      color: typeColor(queryType),
                      border: `1px solid ${typeColor(queryType)}44`,
                      flexShrink: 0,
                    }}>
                      {queryType}
                    </span>
                  )}

                  <span style={{ color: "#4A6278", fontSize: 10, flexShrink: 0 }}>
                    {relTime(s.created_ts)}
                  </span>

                  <span style={{ color: ACCENT, fontSize: 10, flexShrink: 0 }}>
                    {isResolving ? "…" : isExpanded ? "▾" : "▸"}
                  </span>
                </div>

                {/* Resolved members */}
                {isExpanded && resolved && (
                  <div style={{
                    padding: "6px 16px 10px",
                    background: "rgba(0,0,0,0.2)",
                  }}>
                    {!resolved.ok && (
                      <div style={{ color: "#EF4444", fontSize: 10 }}>
                        {resolved.error || "resolve failed"}
                      </div>
                    )}
                    {resolved.ok && (
                      <>
                        <div style={{
                          color: ACCENT, fontSize: 9, letterSpacing: 2, marginBottom: 6,
                        }}>
                          {resolved.count} MEMBER{resolved.count !== 1 ? "S" : ""}
                          {s.query?.limit ? ` (limit ${s.query.limit})` : ""}
                        </div>
                        {resolved.items.length === 0 && (
                          <div style={{ color: "#4A6278", fontSize: 10 }}>no matching objects</div>
                        )}
                        {resolved.items.slice(0, 8).map((obj, i) => (
                          <div key={obj.id || i} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "3px 0",
                            borderBottom: "1px solid #0D182444",
                          }}>
                            {obj.type && (
                              <span style={{
                                padding: "0px 5px", borderRadius: 3, fontSize: 8,
                                background: `${typeColor(obj.type)}22`,
                                color: typeColor(obj.type),
                                border: `1px solid ${typeColor(obj.type)}33`,
                                flexShrink: 0,
                              }}>
                                {obj.type}
                              </span>
                            )}
                            <span style={{
                              color: "#9BBAD0", fontSize: 10,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {obj.label || obj.name || obj.title || obj.id}
                            </span>
                          </div>
                        ))}
                        {resolved.items.length > 8 && (
                          <div style={{ color: "#4A6278", fontSize: 10, paddingTop: 4 }}>
                            +{resolved.items.length - 8} more
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ color: "#2A3844", fontSize: 9, padding: "8px 16px", textAlign: "center" }}>
          GET /v1/ontology-ext/sets · resolve on click · poll 5 min
        </div>
      </div>
    </>
  );
}
