/**
 * F142 Scene × Ops Alert × IntelProfile × Report × Graph
 * Cinematic Scene Intelligence Authority Audit — ◈ SCAUTH
 *
 * Fetches: all 10 /v1/cinematic/scene/{1..10} + /v1/ops/alerts
 *          + /entities/IntelProfile + /v1/reports + /v1/graph/centrality
 * Classifies each cinematic scene across 4 tiers based on cross-source keyword overlap:
 *   AUTHORIZED — matched all 4 external sources (fully documented, monitored scene)
 *   ACTIVE     — matched 2-3 sources
 *   PARTIAL    — matched exactly 1 source
 *   DARK       — zero matches (unmonitored scenes with no ops alert, no intel profile,
 *                no report, no graph trace — operational blind spots)
 * Red pulse on DARK count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CYAN  = "#29E7FF";
const GREEN = "#00FF88";
const AMBER = "#FFB347";
const RED   = "#FF3B6B";
const DIM   = "#566878";

const CLS_COLOR = { AUTHORIZED: GREEN, ACTIVE: CYAN, PARTIAL: AMBER, DARK: RED };
const CLS_ORDER = { AUTHORIZED: 4, ACTIVE: 3, PARTIAL: 2, DARK: 1 };

const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const REFRESH_MS = 90_000;

const SCAUTH_RE = /\b(scauth|scene\.auth|scene.*authority|scene.*intel.*authority|cinematic.*authority|scene.*ops.*intel|scene.*alert.*intel|scene.*report.*graph|scene.*coverage.*audit|unmonitored.*scene|scene.*blind|authority.*audit)\b/i;

export function isScauthQuery(q) { return SCAUTH_RE.test(q || ""); }

export function buildScauthScript(rows) {
  const total      = rows.length;
  const authorized = rows.filter(r => r.cls === "AUTHORIZED").length;
  const dark       = rows.filter(r => r.cls === "DARK").length;
  return (
    `Cinematic Scene Intelligence Authority Audit: ${total} scene${total !== 1 ? "s" : ""} assessed. ` +
    `${authorized} fully authorized (ops alert, intel profile, report, and graph trace confirmed). ` +
    (dark > 0
      ? `${dark} dark — no ops alert, no intel profile, no report, no graph trace. Unmonitored operational blind spots.`
      : "No dark scenes detected.")
  );
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const bToks = new Set(tokens(bStr));
  return aToks.some(t => bToks.has(t));
}

function normalizeArray(raw, keys) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : Array.isArray(raw?.nodes)            ? raw.nodes
    : Array.isArray(raw?.alerts)           ? raw.alerts
    : [];
  return arr.map(item => {
    let label = "";
    for (const k of keys) if (item[k]) { label = String(item[k]); break; }
    return { ...item, _label: label };
  });
}

async function fetcher(path) {
  try {
    const r = await fetch(`${apiBase()}${path}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

function anchorsText(scene) {
  const a = scene?.anchors || scene?.data?.anchors || [];
  if (!Array.isArray(a)) return "";
  return a.map(x => [x.label, x.title, x.name, x.value].filter(Boolean).join(" ")).join(" ");
}

function fmtDate(t) {
  if (!t) return "";
  const d = new Date(typeof t === "number" ? t : Date.parse(t));
  if (Number.isNaN(d.getTime())) return String(t).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function classifyScene(scene, alerts, profiles, reports, nodes) {
  const sceneText = [
    scene.title, scene.name, scene.description, scene.theme,
    scene.subtitle, anchorsText(scene),
  ].filter(Boolean).join(" ");
  const scToks = tokens(sceneText);

  const matchedAlerts = alerts.filter(a =>
    overlaps(scToks, [a._label, a.name, a.title, a.type, a.category, a.message, a.source].join(" "))
  );
  const matchedProfiles = profiles.filter(p =>
    overlaps(scToks, [p._label, p.name, p.title, p.category, p.type, p.subject, p.tags].join(" "))
  );
  const matchedReports = reports.filter(r =>
    overlaps(scToks, [r._label, r.title, r.name, r.type, r.category, r.summary].join(" "))
  );
  const matchedNodes = nodes.filter(n =>
    overlaps(scToks, [n._label, n.label, n.name, n.title, n.type, n.description, n.id].join(" "))
  );

  const sources = [
    matchedAlerts.length > 0,
    matchedProfiles.length > 0,
    matchedReports.length > 0,
    matchedNodes.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4) cls = "AUTHORIZED";
  else if (sources >= 2) cls = "ACTIVE";
  else if (sources === 1) cls = "PARTIAL";
  else cls = "DARK";

  return { scene, cls, matchedAlerts, matchedProfiles, matchedReports, matchedNodes };
}

export default function SceneOpsIntelReportGraphAuthority() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [scenesRaw, alertsRaw, profilesRaw, reportsRaw, graphRaw] = await Promise.all([
        Promise.all(
          SCENE_IDS.map(id =>
            fetch(`${apiBase()}/v1/cinematic/scene/${id}`, { headers: hdrs })
              .then(r => r.ok ? r.json() : null).catch(() => null)
          )
        ),
        fetcher("/v1/ops/alerts"),
        fetcher("/entities/IntelProfile"),
        fetcher("/v1/reports"),
        fetcher("/v1/graph/centrality"),
      ]);

      const scenes   = scenesRaw.map((raw, i) => raw ? { ...raw, _sceneId: SCENE_IDS[i] } : { _sceneId: SCENE_IDS[i] });
      const alerts   = normalizeArray(alertsRaw,   ["name", "title", "message", "type", "source", "category"]);
      const profiles = normalizeArray(profilesRaw, ["name", "title", "subject", "category", "type"]);
      const reports  = normalizeArray(reportsRaw,  ["title", "name", "type", "category", "summary"]);
      const nodes    = normalizeArray(graphRaw,     ["label", "name", "title", "type", "id"]);

      const built = scenes.map(scene => classifyScene(scene, alerts, profiles, reports, nodes));
      built.sort((a, b) => (CLS_ORDER[a.cls] || 0) - (CLS_ORDER[b.cls] || 0));
      setRows(built);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:scauth-toggle", handler);
    return () => window.removeEventListener("jarvis:scauth-toggle", handler);
  }, []);

  useEffect(() => {
    if (open) {
      load();
      timerRef.current = setInterval(load, REFRESH_MS);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildScauthScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      if (r.ok) {
        const json = await r.json();
        const text = json?.response || json?.message || json?.content || script;
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text, voice: "onyx" }),
        });
      }
    } catch { /* silent */ }
    finally { setAssessing(false); }
  }, [assessing, rows]);

  const darkCount = rows.filter(r => r.cls === "DARK").length;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const sceneLabel = [r.scene.title, r.scene.name, r.scene.description, r.scene.theme].filter(Boolean).join(" ").toLowerCase();
      return sceneLabel.includes(q) || r.cls.toLowerCase().includes(q);
    }
    return true;
  });

  const btnPulse = open && darkCount > 0;

  return (
    <>
      {/* ◈ SCAUTH toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Scene × Ops Alert × IntelProfile × Report × Graph — Scene Intelligence Authority Audit"
        style={{
          position: "fixed",
          bottom: 8,
          left: 127880,
          zIndex: 239,
          background: open ? RED + "33" : "#0a0f1a",
          border: `1px solid ${open ? RED : "#1e3a4a"}`,
          borderRadius: 6,
          color: open ? RED : CYAN,
          cursor: "pointer",
          padding: "3px 9px",
          fontSize: 9,
          letterSpacing: 2,
          fontFamily: "inherit",
          fontWeight: 700,
          whiteSpace: "nowrap",
          animation: btnPulse ? "scauth_pulse_btn 1.4s ease-in-out infinite" : "none",
        }}
      >
        {darkCount > 0 && (
          <span style={{
            display: "inline-block", marginRight: 5,
            width: 7, height: 7, borderRadius: "50%",
            background: RED,
            animation: "scauth_pulse 1.4s ease-in-out infinite",
          }} />
        )}
        ◈ SCAUTH
      </button>

      {open && (
        <div style={{
          position: "fixed",
          bottom: 38,
          left: "50%",
          transform: "translateX(-50%)",
          width: 700,
          maxHeight: 480,
          background: "rgba(6,10,18,0.97)",
          border: `1px solid ${RED}55`,
          borderRadius: 10,
          zIndex: 9240,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          color: CYAN,
          fontSize: 11,
          boxShadow: `0 0 40px ${RED}33`,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "8px 12px",
            borderBottom: `1px solid ${RED}33`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}>
            <span style={{ color: RED, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>
              ◈ SCENE INTELLIGENCE AUTHORITY AUDIT
            </span>
            {darkCount > 0 && (
              <span style={{
                background: RED + "33",
                border: `1px solid ${RED}`,
                borderRadius: 4,
                color: RED,
                padding: "1px 7px",
                fontSize: 9,
                fontWeight: 700,
                animation: "scauth_pulse 1.4s ease-in-out infinite",
              }}>
                {darkCount} DARK
              </span>
            )}
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              Scene × Ops Alert × IntelProfile × Report × Graph
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", color: DIM,
                cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0,
              }}
            >✕</button>
          </div>

          {/* Filters */}
          <div style={{
            padding: "6px 12px",
            borderBottom: `1px solid ${RED}22`,
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexShrink: 0,
          }}>
            {["ALL", "AUTHORIZED", "ACTIVE", "PARTIAL", "DARK"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? (CLS_COLOR[f] || CYAN) + "22" : "none",
                  border: `1px solid ${filter === f ? (CLS_COLOR[f] || CYAN) : "#1e3a4a"}`,
                  borderRadius: 4,
                  color: filter === f ? (CLS_COLOR[f] || CYAN) : DIM,
                  cursor: "pointer",
                  padding: "2px 8px",
                  fontSize: 8,
                  letterSpacing: 1,
                  fontFamily: "inherit",
                  fontWeight: 700,
                }}
              >{f} {f !== "ALL" ? `(${rows.filter(r => r.cls === f).length})` : `(${rows.length})`}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search scenes…"
              style={{
                marginLeft: "auto",
                background: "#0a0f1a",
                border: `1px solid #1e3a4a`,
                borderRadius: 4,
                color: CYAN,
                padding: "2px 8px",
                fontSize: 9,
                fontFamily: "inherit",
                outline: "none",
                width: 130,
              }}
            />
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {loading && (
              <div style={{ padding: 20, textAlign: "center", color: DIM }}>Loading scenes…</div>
            )}
            {error && (
              <div style={{ padding: 10, color: RED }}>{error}</div>
            )}
            {!loading && !error && visible.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: DIM }}>No scenes match.</div>
            )}
            {!loading && visible.map((row, idx) => {
              const key = `scene-${row.scene._sceneId ?? idx}`;
              const isExp = !!expanded[key];
              const clsColor = CLS_COLOR[row.cls] || CYAN;
              const sceneLabel = row.scene.title || row.scene.name || row.scene.theme || `Scene ${row.scene._sceneId ?? idx + 1}`;

              return (
                <div key={key} style={{
                  borderBottom: `1px solid ${RED}11`,
                  background: isExp ? "#0a0f1acc" : "transparent",
                }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 12px",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      minWidth: 80,
                      color: clsColor,
                      fontWeight: 700,
                      fontSize: 9,
                      letterSpacing: 1,
                    }}>{row.cls}</span>

                    <span style={{ flex: 1, color: CYAN, fontSize: 10 }}>
                      {sceneLabel}
                    </span>

                    <span style={{
                      fontSize: 9, color: DIM, marginLeft: 6,
                    }}>
                      S{row.scene._sceneId ?? "?"}
                    </span>

                    {/* Source badges */}
                    {row.matchedAlerts.length > 0 && (
                      <span style={{
                        background: RED + "22", border: `1px solid ${RED}55`,
                        borderRadius: 3, color: RED,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>A:{row.matchedAlerts.length}</span>
                    )}
                    {row.matchedProfiles.length > 0 && (
                      <span style={{
                        background: AMBER + "22", border: `1px solid ${AMBER}55`,
                        borderRadius: 3, color: AMBER,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>P:{row.matchedProfiles.length}</span>
                    )}
                    {row.matchedReports.length > 0 && (
                      <span style={{
                        background: CYAN + "22", border: `1px solid ${CYAN}55`,
                        borderRadius: 3, color: CYAN,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>R:{row.matchedReports.length}</span>
                    )}
                    {row.matchedNodes.length > 0 && (
                      <span style={{
                        background: GREEN + "22", border: `1px solid ${GREEN}55`,
                        borderRadius: 3, color: GREEN,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>G:{row.matchedNodes.length}</span>
                    )}

                    <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      padding: "4px 12px 10px 24px",
                      borderTop: `1px solid ${RED}11`,
                    }}>
                      {row.scene.description && (
                        <div style={{ color: DIM, fontSize: 9, marginBottom: 6 }}>
                          {String(row.scene.description).slice(0, 160)}
                        </div>
                      )}

                      {row.matchedAlerts.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: RED, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>OPS ALERTS</div>
                          {row.matchedAlerts.slice(0, 4).map((a, i) => (
                            <div key={i} style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "2px 0",
                            }}>
                              <span style={{
                                background: RED + "22", border: `1px solid ${RED}55`,
                                borderRadius: 3, color: RED,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{a.severity || a.level || "ALERT"}</span>
                              <span style={{ color: CYAN, fontSize: 9 }}>
                                {a._label || a.name || a.type || "Alert"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedProfiles.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: AMBER, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>INTEL PROFILES</div>
                          {row.matchedProfiles.slice(0, 4).map((p, i) => (
                            <div key={i} style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "2px 0",
                            }}>
                              <span style={{
                                background: AMBER + "22", border: `1px solid ${AMBER}55`,
                                borderRadius: 3, color: AMBER,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{p.category || p.type || "PROFILE"}</span>
                              <span style={{ color: CYAN, fontSize: 9 }}>
                                {p._label || p.name || p.subject || "Profile"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedReports.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: CYAN, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>REPORTS</div>
                          {row.matchedReports.slice(0, 4).map((r, i) => (
                            <div key={i} style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "2px 0",
                            }}>
                              <span style={{
                                background: CYAN + "22", border: `1px solid ${CYAN}55`,
                                borderRadius: 3, color: CYAN,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{fmtDate(r.date || r.created_at || r.published_at || r.timestamp) || r.type || "RPT"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>
                                {r._label || r.title || r.name || "Report"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedNodes.length > 0 && (
                        <div style={{ marginBottom: 2 }}>
                          <div style={{ color: GREEN, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>GRAPH NODES</div>
                          {row.matchedNodes.slice(0, 4).map((n, i) => (
                            <div key={i} style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "2px 0",
                            }}>
                              <span style={{
                                background: GREEN + "22", border: `1px solid ${GREEN}55`,
                                borderRadius: 3, color: GREEN,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{typeof n.centrality === "number" ? n.centrality.toFixed(3) : n.score?.toFixed?.(3) || "—"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>
                                {n._label || n.label || n.name || n.id || "Node"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedAlerts.length === 0 && row.matchedProfiles.length === 0 &&
                        row.matchedReports.length === 0 && row.matchedNodes.length === 0 && (
                        <div style={{ color: RED, fontSize: 9, fontStyle: "italic" }}>
                          No ops alerts, intel profiles, reports, or graph nodes matched — scene is operationally dark.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 12px",
            borderTop: `1px solid ${RED}22`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: assessing ? RED + "44" : RED + "22",
                border: `1px solid ${RED}55`,
                borderRadius: 6,
                color: RED,
                cursor: assessing ? "not-allowed" : "pointer",
                padding: "4px 14px",
                fontSize: 9,
                letterSpacing: 2,
                fontFamily: "inherit",
                fontWeight: 700,
              }}
            >{assessing ? "ASSESSING…" : "▶ ASSESS"}</button>
            <span style={{ color: DIM, fontSize: 9 }}>
              Scene × OpsAlert × IntelProfile × Report × Graph
            </span>
            <button
              onClick={load}
              disabled={loading}
              style={{
                marginLeft: "auto",
                background: "none",
                border: `1px solid #334455`,
                borderRadius: 5,
                color: DIM,
                cursor: loading ? "not-allowed" : "pointer",
                padding: "3px 10px",
                fontSize: 9,
                fontFamily: "inherit",
              }}
            >{loading ? "…" : "↺"}</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scauth_pulse {
          0%,100% { opacity:1; } 50% { opacity:0.3; }
        }
        @keyframes scauth_pulse_btn {
          0%,100% { box-shadow:0 0 20px ${RED}88; } 50% { box-shadow:0 0 40px ${RED}cc; }
        }
      `}</style>
    </>
  );
}
