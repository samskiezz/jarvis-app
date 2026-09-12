/**
 * F265 Vision Tracking Monitor
 * Polls GET /v1/vision/tracking/matches?limit=50 every 90 s.
 * Lists matches with possession split, pass count, processed timestamp.
 * Expand row → lazy GET /v1/vision/tracking/matches/{id} for full summary
 *   + GET /v1/vision/tracking/matches/{id}/frames?limit=200 for frame stats.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence tracking brief + TTS.
 * ⊛ VTRK button at left:233280 bottom:8 zIndex:144; jarvis:vtrk-toggle event.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY = "#29E7FF";
const AM = "#F59E0B";
const GN = "#34D399";
const RD = "#F87171";
const PURPLE = "#A78BFA";
const API = "";

const JARVIS_API_KEY =
  typeof window !== "undefined"
    ? window.__JARVIS_API_KEY__ || "dev-key"
    : "dev-key";

async function apiFetch(path, opts = {}) {
  const r = await fetch(path, {
    headers: { Authorization: `Bearer ${JARVIS_API_KEY}`, "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export function isVtrkQuery(q) {
  return /\b(vision tracking|match tracks|player tracking|vtrk|tracking data|match analysis|frame tracks|tracking database|vision match|possession data|track players|player positions)\b/i.test(q);
}

export function buildVtrkScript(matches) {
  const list = matches || [];
  const total = list.length;
  const avgPossH = total
    ? (list.reduce((s, m) => s + (m.possession_home || 0), 0) / total).toFixed(1)
    : 0;
  const totalPasses = list.reduce((s, m) => s + (m.n_passes || 0), 0);
  const recent = list[0];
  const recentStr = recent
    ? `Most recent: ${recent.home} vs ${recent.away} — home ${(recent.possession_home || 0).toFixed(1)}% possession, ${recent.n_passes || 0} passes.`
    : "No matches yet.";
  return `Provide a 2-sentence tactical analysis brief for the vision tracking database. Total matches: ${total}. Average home possession: ${avgPossH}%. Total passes logged: ${totalPasses}. ${recentStr} Focus on key possession and passing patterns.`;
}

function StatTile({ label, value, color = CY }) {
  return (
    <div style={{
      flex: 1, background: "rgba(41,231,255,0.04)", border: `1px solid ${color}22`,
      borderRadius: 8, padding: "8px 10px", textAlign: "center",
    }}>
      <div style={{ color, fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>{value ?? "—"}</div>
      <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1.5, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function PossBar({ home, away }) {
  const h = Math.max(0, Math.min(100, home || 0));
  const a = Math.max(0, Math.min(100, away || 0));
  return (
    <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", width: "100%" }}>
      <div style={{ width: `${h}%`, background: GN }} />
      <div style={{ width: `${a}%`, background: RD }} />
      <div style={{ flex: 1, background: "rgba(255,255,255,0.06)" }} />
    </div>
  );
}

function fmtAge(ts) {
  if (!ts) return "—";
  const d = Date.now() / 1000 - ts;
  if (d < 60) return `${Math.floor(d)}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

function fmtTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

export default function VisionTrackingMonitor() {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState([]);
  const [total, setTotal] = useState(0);
  const [dbExists, setDbExists] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiFetch(`${API}/v1/vision/tracking/matches?limit=50`);
      setMatches(d.matches || []);
      setTotal(d.total || 0);
      setDbExists(d.db_exists !== false);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 90000);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    const onAsk = (e) => {
      if (e.detail?.query && isVtrkQuery(e.detail.query)) setOpen(true);
    };
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:ask", onAsk);
    window.addEventListener("jarvis:vtrk-toggle", onToggle);
    return () => {
      window.removeEventListener("jarvis:ask", onAsk);
      window.removeEventListener("jarvis:vtrk-toggle", onToggle);
    };
  }, []);

  const loadDetail = useCallback(async (matchId) => {
    if (detail[matchId]) return;
    try {
      const [matchDetail, frames] = await Promise.all([
        apiFetch(`${API}/v1/vision/tracking/matches/${encodeURIComponent(matchId)}`),
        apiFetch(`${API}/v1/vision/tracking/matches/${encodeURIComponent(matchId)}/frames?limit=200`),
      ]);
      setDetail((prev) => ({ ...prev, [matchId]: { matchDetail, frames } }));
    } catch {
      setDetail((prev) => ({ ...prev, [matchId]: { error: true } }));
    }
  }, [detail]);

  const handleExpand = useCallback((matchId) => {
    if (expanded === matchId) {
      setExpanded(null);
    } else {
      setExpanded(matchId);
      loadDetail(matchId);
    }
  }, [expanded, loadDetail]);

  const handleAssess = async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const script = buildVtrkScript(matches);
      const r = await apiFetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        body: JSON.stringify({ message: script }),
      });
      const text = r.response || r.message || r.content || "(no response)";
      setAssessment(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssessment("(assessment failed)");
    } finally {
      setAssessing(false);
    }
  };

  const filtered = matches.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (m.match_id || "").toLowerCase().includes(q) ||
      (m.home || "").toLowerCase().includes(q) ||
      (m.away || "").toLowerCase().includes(q)
    );
  });

  const avgPossH =
    matches.length
      ? (matches.reduce((s, m) => s + (m.possession_home || 0), 0) / matches.length).toFixed(1)
      : "—";
  const totalPasses = matches.reduce((s, m) => s + (m.n_passes || 0), 0);
  const badgeColor = matches.length > 0 ? GN : AM;

  const panelStyle = {
    position: "fixed", bottom: 48, left: "50%", transform: "translateX(-50%)",
    width: 540, maxHeight: "75vh", zIndex: 144,
    background: "rgba(4,10,18,0.97)", border: `1px solid ${CY}33`,
    borderRadius: 12, display: "flex", flexDirection: "column",
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
    boxShadow: `0 0 40px ${CY}18`,
  };

  const chip = (label, color) => (
    <span style={{
      padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
      background: `${color}22`, color, letterSpacing: 1, marginRight: 4,
    }}>
      {label}
    </span>
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed", bottom: 8, left: 233280, zIndex: 144,
          background: open ? `${CY}22` : "rgba(5,10,18,0.88)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          borderRadius: 6, color: open ? CY : "#4E6070",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
          letterSpacing: 1.5, padding: "4px 8px", cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ⊛ VTRK
        {matches.length > 0 && (
          <span style={{
            marginLeft: 5, background: badgeColor, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {matches.length}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 2 }}>
              ⊛ VISION TRACKING
            </span>
            {!dbExists && chip("DB NOT FOUND", RD)}
            {loading && <span style={{ color: AM, fontSize: 9 }}>LOADING…</span>}
            {error && <span style={{ color: RD, fontSize: 9 }}>ERR:{error}</span>}
            <div style={{ flex: 1 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search matches…"
              style={{
                background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`,
                borderRadius: 4, color: CY, padding: "3px 8px", fontSize: 10,
                outline: "none", width: 140,
              }}
            />
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", color: "#4E6070",
                cursor: "pointer", fontSize: 14, padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px" }}>
            <StatTile label="MATCHES" value={total} color={CY} />
            <StatTile label="HOME POSS%" value={avgPossH} color={GN} />
            <StatTile label="TOTAL PASSES" value={totalPasses} color={PURPLE} />
            <StatTile label="LOADED" value={matches.length} color={AM} />
          </div>

          {/* Match list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 4px" }}>
            {filtered.length === 0 && (
              <div style={{ color: "#4E6070", textAlign: "center", padding: 20, fontSize: 10 }}>
                {dbExists ? "No matches found." : "Tracking database not found on server."}
              </div>
            )}
            {filtered.map((m) => {
              const isExp = expanded === m.match_id;
              const det = detail[m.match_id];
              return (
                <div
                  key={m.match_id}
                  style={{
                    borderBottom: `1px solid ${CY}11`,
                    paddingBottom: 6, marginBottom: 6,
                  }}
                >
                  {/* Match row */}
                  <div
                    onClick={() => handleExpand(m.match_id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      cursor: "pointer", padding: "5px 0",
                      borderRadius: 4,
                    }}
                  >
                    <span style={{ color: isExp ? CY : "#4E6070", width: 10, flexShrink: 0 }}>
                      {isExp ? "▼" : "▶"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: CY, fontSize: 10, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.home || "?"} vs {m.away || "?"}
                      </div>
                      <div style={{ color: "#4E6070", fontSize: 9, marginTop: 1 }}>
                        {m.match_id} · {fmtAge(m.processed_at)} ago
                      </div>
                    </div>
                    {/* Possession bar + numbers */}
                    <div style={{ width: 120, flexShrink: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, fontSize: 8 }}>
                        <span style={{ color: GN }}>{(m.possession_home || 0).toFixed(0)}%</span>
                        <span style={{ color: RD }}>{(m.possession_away || 0).toFixed(0)}%</span>
                      </div>
                      <PossBar home={m.possession_home} away={m.possession_away} />
                    </div>
                    <div style={{ color: PURPLE, fontSize: 9, width: 50, textAlign: "right", flexShrink: 0 }}>
                      {m.n_passes ?? 0} pass
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{
                      marginLeft: 18, marginTop: 4, marginBottom: 4,
                      background: "rgba(41,231,255,0.03)", borderRadius: 6,
                      border: `1px solid ${CY}11`, padding: "8px 10px",
                    }}>
                      {!det && (
                        <div style={{ color: AM, fontSize: 9 }}>Loading detail…</div>
                      )}
                      {det?.error && (
                        <div style={{ color: RD, fontSize: 9 }}>Failed to load detail.</div>
                      )}
                      {det && !det.error && det.matchDetail && (
                        <>
                          {/* Summary stats */}
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
                            {[
                              ["Frames", det.matchDetail.summary?.frames ?? "—", CY],
                              ["Tracks", det.matchDetail.summary?.tracks ?? "—", PURPLE],
                              ["Players", det.matchDetail.summary?.players ?? "—", GN],
                              ["Home", det.matchDetail.summary?.home_players ?? "—", GN],
                              ["Away", det.matchDetail.summary?.away_players ?? "—", RD],
                              ["Avg Ball Speed", (det.matchDetail.match?.avg_ball_speed || 0).toFixed(2), AM],
                            ].map(([label, val, color]) => (
                              <div key={label} style={{ textAlign: "center" }}>
                                <div style={{ color, fontSize: 13, fontWeight: 700 }}>{val}</div>
                                <div style={{ color: "#4E6070", fontSize: 8 }}>{label}</div>
                              </div>
                            ))}
                          </div>
                          {/* Source + time */}
                          <div style={{ color: "#4E6070", fontSize: 8, marginBottom: 6 }}>
                            Source: {det.matchDetail.match?.video_source || "—"} · Processed: {fmtTs(det.matchDetail.match?.processed_at)}
                          </div>
                          {/* Frame sample */}
                          {det.frames?.frames?.length > 0 && (
                            <div>
                              <div style={{ color: "#4E6070", fontSize: 8, marginBottom: 4 }}>
                                SAMPLE FRAMES ({det.frames.frames.length} of {det.frames.total_frames ?? "?"} total)
                              </div>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {det.frames.frames.slice(0, 8).map((f) => {
                                  const homeT = f.tracks?.filter((t) => t.team === "home").length ?? 0;
                                  const awayT = f.tracks?.filter((t) => t.team === "away").length ?? 0;
                                  return (
                                    <div key={f.frame_idx} style={{
                                      background: "rgba(41,231,255,0.05)", border: `1px solid ${CY}22`,
                                      borderRadius: 4, padding: "4px 6px", fontSize: 8, minWidth: 52,
                                    }}>
                                      <div style={{ color: "#4E6070" }}>f{f.frame_idx}</div>
                                      <div style={{ color: GN }}>⬤ {homeT}</div>
                                      <div style={{ color: RD }}>⬤ {awayT}</div>
                                    </div>
                                  );
                                })}
                              </div>
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

          {/* Assess + assessment */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${CY}22` }}>
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background: assessing ? "rgba(41,231,255,0.08)" : "rgba(41,231,255,0.12)",
                border: `1px solid ${CY}55`, borderRadius: 5,
                color: assessing ? AM : CY, fontSize: 9, letterSpacing: 1.5,
                padding: "4px 12px", cursor: assessing ? "default" : "pointer",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {assessing ? "⋯ ASSESSING" : "▶ ASSESS"}
            </button>
            {assessment && (
              <div style={{
                marginTop: 6, color: "#A0B4BF", fontSize: 9, lineHeight: 1.6,
                background: "rgba(41,231,255,0.03)", borderRadius: 4, padding: "5px 8px",
              }}>
                {assessment}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 14px 6px", borderTop: `1px solid ${CY}11`,
            color: "#2a3a47", fontSize: 8, letterSpacing: 1,
          }}>
            90 s poll · GET /v1/vision/tracking/matches
          </div>
        </div>
      )}
    </>
  );
}
