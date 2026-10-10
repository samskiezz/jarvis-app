/**
 * OpsAlertCommunityInvestmentMap — F247.
 *
 * Parallel-fetches /v1/ops/alerts × /v1/graph/communities × /entities/Investment
 * and keyword-correlates each ops alert against graph communities AND
 * portfolio investments to classify:
 *
 *   FULLY_MAPPED    — alert has ≥1 matching community AND ≥1 matching investment
 *   COMMUNITY_ONLY  — community match exists but no investment linkage
 *   FUNDED_ONLY     — investment match exists but no community linkage
 *   UNMAPPED        — neither (financial risk alert with no coverage)
 *
 * Stat tiles: OPS ALERTS / COMMUNITIES / INVESTMENTS / UNMAPPED
 * Amber badge: UNMAPPED count on toggle button.
 * Filter tabs: ALL | FULLY_MAPPED | COMMUNITY_ONLY | FUNDED_ONLY | UNMAPPED + text search.
 * Expand alert → matched community cards (cyan) + investment cards (green) with relevance bars.
 * ▶ ASSESS ALERT COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 *
 * Toggle:  ◈ FRACMAP at left:1095040, bottom:8, zIndex:671.
 * Event:   jarvis:fracmap-toggle
 * Voice:   "fracmap" / "ops alert community" / "alert investment" /
 *          "financial risk alert" / "community alert funding" /
 *          "investment risk alert" / "alert coverage gap" /
 *          "ops alert coverage" / "risk alert map"
 * Refresh: 90s auto-refresh while open.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM  = "#FFB300";
const CY  = "#00E5FF";
const GN  = "#4CAF50";
const OR  = "#FF9800";
const RD  = "#FF3D3D";
const DIM = "rgba(255,255,255,0.04)";
const BG  = "rgba(6,10,18,0.94)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 1095040;
const Z_IDX      = 671;

const FRACMAP_RE =
  /\b(fracmap|ops[._\-\s]alert[._\-\s]community|alert[._\-\s]investment|financial[._\-\s]risk[._\-\s]alert|community[._\-\s]alert[._\-\s]funding|investment[._\-\s]risk[._\-\s]alert|alert[._\-\s]coverage[._\-\s]gap|ops[._\-\s]alert[._\-\s]coverage|risk[._\-\s]alert[._\-\s]map)\b/i;

export function isFracmapQuery(t) {
  return FRACMAP_RE.test(t || "");
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normAlerts(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.alerts || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((v, i) => ({
    id:       v.id || String(i),
    name:     v.name || v.title || v.alert || v.message || `Alert ${i + 1}`,
    desc:     v.description || v.detail || v.summary || v.message || "",
    severity: v.severity || v.level || v.priority || "",
    type:     v.type || v.category || v.kind || "",
    source:   v.source || v.service || "",
  }));
}

function normCommunities(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.communities || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((c, i) => ({
    id:     c.id || String(i),
    name:   c.name || c.label || c.community || `Community ${i + 1}`,
    desc:   c.description || c.summary || c.detail || "",
    tags:   (c.tags || c.members || []).join ? (c.tags || c.members || []).join(" ") : String(c.tags || ""),
    type:   c.type || c.category || "",
    size:   c.size || c.node_count || c.count || 0,
  }));
}

function normInvestments(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.investments || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((inv, i) => ({
    id:     inv.id || String(i),
    name:   inv.name || inv.title || inv.asset || `Investment ${i + 1}`,
    desc:   inv.description || inv.summary || inv.detail || "",
    type:   inv.type || inv.category || inv.asset_class || "",
    status: inv.status || inv.state || "",
    tags:   (inv.tags || []).join ? (inv.tags || []).join(" ") : String(inv.tags || ""),
  }));
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevanceScore(alert, other) {
  const aWords = new Set(tokens(`${alert.name} ${alert.desc} ${alert.type} ${alert.severity} ${alert.source}`));
  const oWords = tokens(`${other.name} ${other.desc} ${other.type || ""} ${other.tags || ""} ${other.status || ""}`);
  const hits = oWords.filter(w => aWords.has(w));
  return hits.length / Math.max(oWords.length, 1);
}

function classify(alerts, communities, investments) {
  return alerts.map(alert => {
    const matchedCommunities = communities
      .map(c => ({ ...c, score: relevanceScore(alert, c) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);

    const matchedInvestments = investments
      .map(inv => ({ ...inv, score: relevanceScore(alert, inv) }))
      .filter(inv => inv.score > 0)
      .sort((a, b) => b.score - a.score);

    let coverage;
    if (matchedCommunities.length > 0 && matchedInvestments.length > 0) {
      coverage = "FULLY_MAPPED";
    } else if (matchedCommunities.length > 0) {
      coverage = "COMMUNITY_ONLY";
    } else if (matchedInvestments.length > 0) {
      coverage = "FUNDED_ONLY";
    } else {
      coverage = "UNMAPPED";
    }

    return { ...alert, coverage, matchedCommunities, matchedInvestments };
  });
}

// ── voice script ─────────────────────────────────────────────────────────────

export async function buildFracmapScript() {
  const base = apiBase();
  const [aRaw, cRaw, iRaw] = await Promise.all([
    fetch(`${base}/v1/ops/alerts`,        { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/v1/graph/communities`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/Investment`,  { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const alerts      = normAlerts(aRaw);
  const communities = normCommunities(cRaw);
  const investments = normInvestments(iRaw);
  const rows        = classify(alerts, communities, investments);
  const unmapped    = rows.filter(r => r.coverage === "UNMAPPED").length;
  const fullyMapped = rows.filter(r => r.coverage === "FULLY_MAPPED").length;
  return `Financial Risk Alert Map online, sir. Of ${alerts.length} active operational alerts cross-referenced against ${communities.length} graph communities and ${investments.length} portfolio investments, ${fullyMapped} alerts have full community and investment coverage — but ${unmapped} alerts have no matching community or investment context, representing critical financial risk blind spots that require immediate assessment.`;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function coverageColour(c) {
  if (c === "FULLY_MAPPED")    return GN;
  if (c === "COMMUNITY_ONLY")  return CY;
  if (c === "FUNDED_ONLY")     return OR;
  return AM;
}

// ── component ────────────────────────────────────────────────────────────────

export default function OpsAlertCommunityInvestmentMap() {
  const [open,        setOpen]        = useState(false);
  const [rows,        setRows]        = useState([]);
  const [alertCount,  setAlertCount]  = useState(0);
  const [commCount,   setCommCount]   = useState(0);
  const [invCount,    setInvCount]    = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [err,         setErr]         = useState(null);
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const [aRaw, cRaw, iRaw] = await Promise.all([
        fetch(`${base}/v1/ops/alerts`,        { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/v1/graph/communities`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/Investment`,  { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const alerts      = normAlerts(aRaw);
      const communities = normCommunities(cRaw);
      const investments = normInvestments(iRaw);
      setAlertCount(alerts.length);
      setCommCount(communities.length);
      setInvCount(investments.length);
      setRows(classify(alerts, communities, investments));
    } catch (e) {
      setErr(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:fracmap-toggle", toggle);
    return () => window.removeEventListener("jarvis:fracmap-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timer.current); return; }
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const unmapped = rows.filter(r => r.coverage === "UNMAPPED").length;

  const FILTERS = ["ALL", "FULLY_MAPPED", "COMMUNITY_ONLY", "FUNDED_ONLY", "UNMAPPED"];

  const visible = rows
    .filter(r => filter === "ALL" || r.coverage === filter)
    .filter(r => !search || `${r.name} ${r.desc} ${r.severity} ${r.type}`.toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildFracmapScript();
      const base   = apiBase();
      const voice  = getActiveVoice ? getActiveVoice() : "ash";
      const r = await fetch(`${base}/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script, voice }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        new Audio(url).play();
      }
    } catch { /* silent */ }
    setAssessing(false);
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
    background: unmapped > 0 ? "rgba(255,179,0,0.12)" : "rgba(0,229,255,0.07)",
    border: `1px solid ${unmapped > 0 ? AM : CY}44`,
    color: unmapped > 0 ? AM : CY,
    fontFamily: MN, fontSize: 9, letterSpacing: 1.5, padding: "4px 8px",
    cursor: "pointer", borderRadius: 3,
  };

  const panelStyle = {
    position: "fixed", bottom: 36, left: BTN_LEFT - 360, width: 600, maxHeight: "70vh",
    overflowY: "auto", background: BG, border: `1px solid ${AM}44`,
    borderRadius: 6, zIndex: Z_IDX + 1, fontFamily: MN, fontSize: 11,
    color: "rgba(255,255,255,0.85)", padding: 16,
  };

  if (!open) {
    return (
      <button style={btnStyle} onClick={() => setOpen(true)}>
        ◈ FRACMAP{unmapped > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000", borderRadius: 2,
            padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>{unmapped}</span>
        )}
      </button>
    );
  }

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)}>▼ FRACMAP</button>
      <div style={panelStyle}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ color: AM, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◎ FINANCIAL RISK ALERT MAP</span>
          <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.35)", fontSize: 9 }}>
            {loading ? "loading…" : "↻ 90s"}
          </span>
          <button onClick={load} disabled={loading}
            style={{ background: "none", border: `1px solid ${CY}44`, color: CY,
              fontFamily: MN, fontSize: 9, padding: "2px 7px", cursor: "pointer", borderRadius: 2 }}>
            ↺
          </button>
        </div>

        {err && <div style={{ color: RD, marginBottom: 8, fontSize: 10 }}>⚠ {err}</div>}

        {/* stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 12 }}>
          {[
            { label: "OPS ALERTS",   val: alertCount, col: CY },
            { label: "COMMUNITIES",  val: commCount,  col: CY },
            { label: "INVESTMENTS",  val: invCount,   col: GN },
            { label: "UNMAPPED",     val: unmapped,   col: unmapped > 0 ? AM : GN },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              background: DIM, border: `1px solid ${col}33`, borderRadius: 4,
              padding: "6px 8px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 8, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* coverage bar */}
        {rows.length > 0 && (() => {
          const fm  = rows.filter(r => r.coverage === "FULLY_MAPPED").length;
          const pct = Math.round((fm / rows.length) * 100);
          return (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9,
                color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>
                <span>COVERAGE</span><span>{pct}%</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${pct}%`,
                  background: pct > 70 ? GN : pct > 40 ? AM : RD, borderRadius: 2,
                  transition: "width 0.5s" }} />
              </div>
            </div>
          );
        })()}

        {/* filter tabs */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                background: filter === f ? `${coverageColour(f === "ALL" ? "FULLY_MAPPED" : f)}22` : "none",
                border: `1px solid ${filter === f ? coverageColour(f === "ALL" ? "FULLY_MAPPED" : f) : "rgba(255,255,255,0.12)"}`,
                color: filter === f ? coverageColour(f === "ALL" ? "FULLY_MAPPED" : f) : "rgba(255,255,255,0.4)",
                fontFamily: MN, fontSize: 8, padding: "2px 7px", cursor: "pointer", borderRadius: 2,
              }}>
              {f}{f !== "ALL" && ` (${rows.filter(r => r.coverage === f).length})`}
            </button>
          ))}
        </div>

        {/* search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search alerts…"
          style={{
            width: "100%", boxSizing: "border-box", background: DIM, border: `1px solid rgba(255,255,255,0.1)`,
            color: "rgba(255,255,255,0.8)", fontFamily: MN, fontSize: 10, padding: "4px 8px",
            borderRadius: 3, marginBottom: 10, outline: "none",
          }}
        />

        {/* rows */}
        {visible.length === 0 && !loading && (
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textAlign: "center", padding: 16 }}>
            No alerts match current filter.
          </div>
        )}

        {visible.map(alert => {
          const col   = coverageColour(alert.coverage);
          const isExp = expanded === alert.id;

          return (
            <div key={alert.id} style={{
              background: DIM, border: `1px solid ${col}33`, borderRadius: 4,
              marginBottom: 5, overflow: "hidden",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : alert.id)}
                style={{ padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              >
                <span style={{ color: col, fontSize: 9, fontWeight: 700, minWidth: 120 }}>{alert.coverage}</span>
                <span style={{ flex: 1, color: "rgba(255,255,255,0.8)", fontSize: 10 }}>{alert.name}</span>
                {alert.severity && (
                  <span style={{
                    background: `${col}22`, border: `1px solid ${col}55`,
                    color: col, fontSize: 8, padding: "1px 5px", borderRadius: 2,
                  }}>{alert.severity.toUpperCase()}</span>
                )}
                <span style={{ color: CY, fontSize: 9 }}>{alert.matchedCommunities.length}c</span>
                <span style={{ color: GN, fontSize: 9 }}>{alert.matchedInvestments.length}i</span>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)`, padding: "8px 10px" }}>
                  {alert.desc && (
                    <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, marginBottom: 8, fontStyle: "italic" }}>
                      {alert.desc.slice(0, 180)}{alert.desc.length > 180 ? "…" : ""}
                    </div>
                  )}

                  {/* communities */}
                  {alert.matchedCommunities.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: CY, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>GRAPH COMMUNITIES</div>
                      {alert.matchedCommunities.slice(0, 4).map(c => (
                        <div key={c.id} style={{
                          background: `${CY}0A`, border: `1px solid ${CY}33`,
                          borderRadius: 3, padding: "4px 8px", marginBottom: 3,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 9, flex: 1 }}>{c.name}</span>
                            {c.size > 0 && (
                              <span style={{
                                background: `${CY}22`, border: `1px solid ${CY}44`,
                                color: CY, fontSize: 7, padding: "1px 4px", borderRadius: 2,
                              }}>{c.size} nodes</span>
                            )}
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${Math.round(c.score * 100)}%`,
                              background: CY, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* investments */}
                  {alert.matchedInvestments.length > 0 && (
                    <div>
                      <div style={{ color: GN, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>LINKED INVESTMENTS</div>
                      {alert.matchedInvestments.slice(0, 4).map(inv => (
                        <div key={inv.id} style={{
                          background: `${GN}0A`, border: `1px solid ${GN}33`,
                          borderRadius: 3, padding: "4px 8px", marginBottom: 3,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 9, flex: 1 }}>{inv.name}</span>
                            {inv.type && (
                              <span style={{
                                background: `${GN}22`, border: `1px solid ${GN}44`,
                                color: GN, fontSize: 7, padding: "1px 4px", borderRadius: 2,
                              }}>{inv.type}</span>
                            )}
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${Math.round(inv.score * 100)}%`,
                              background: GN, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {alert.matchedCommunities.length === 0 && alert.matchedInvestments.length === 0 && (
                    <div style={{ color: AM, fontSize: 9, fontStyle: "italic" }}>
                      ⚠ No matching communities or investments found for this alert.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* assess */}
        <div style={{ marginTop: 12, borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 10 }}>
          <button onClick={assess} disabled={assessing || loading}
            style={{
              background: assessing ? `${AM}22` : "none",
              border: `1px solid ${AM}66`, color: AM,
              fontFamily: MN, fontSize: 9, letterSpacing: 1, padding: "5px 14px",
              cursor: assessing ? "default" : "pointer", borderRadius: 3,
            }}>
            {assessing ? "◍ assessing…" : "▶ ASSESS ALERT COVERAGE"}
          </button>
        </div>
      </div>
    </>
  );
}
