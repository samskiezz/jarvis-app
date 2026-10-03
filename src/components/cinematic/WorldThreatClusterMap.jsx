/**
 * F191 — Live Intel × Graph Community × RiskSignal World Threat Cluster Map (WTCMAP)
 *
 * Parallel-fetches /functions/getLiveIntel + /v1/graph/communities + /entities/RiskSignal
 * and keyword-correlates each live world event (quake/crypto/FX) against network
 * community clusters AND active risk signals to classify:
 *
 *   CLUSTER_FLAGGED  — matched community + risk signal (network amplified threat)
 *   NETWORK_EXPOSED  — community match only, no risk signal
 *   RISK_SIGNALED    — risk signal match only, no community cluster
 *   CLEAR            — no matches
 *
 * Stat tiles: LIVE EVENTS / COMMUNITIES / RISK SIGNALS + four class counts + FLAGGED%.
 * Red badge on CLUSTER_FLAGGED count.
 * Filter tabs ALL / CLUSTER_FLAGGED / NETWORK_EXPOSED / RISK_SIGNALED / CLEAR + text search.
 * Expand event → matched community cards (purple) + risk signal cards (red) with relevance bars.
 * ▶ ASSESS WORLD THREATS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 5-min auto-refresh. jarvis:wtcmap-toggle event.
 *
 * Voice triggers:
 *   "wtcmap / world threat cluster / live threat cluster / threat cluster /
 *    cluster flagged / network threat / live intel cluster / world risk cluster"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_049_320;
const Z_INDEX  = 252;
const POLL_MS  = 300_000; // 5 minutes
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const WTCMAP_RE = /\b(wtcmap|world[\s-]threat[\s-]cluster|live[\s-]threat[\s-]cluster|threat[\s-]cluster|cluster[\s-]flagged|network[\s-]threat|live[\s-]intel[\s-]cluster|world[\s-]risk[\s-]cluster)\b/i;

export function isWtcmapQuery(q = "") { return WTCMAP_RE.test(q); }

export async function buildWtcmapScript() {
  const base = apiBase();
  const [intelRes, commRes, riskRes] = await Promise.allSettled([
    fetch(`${base}/functions/getLiveIntel`).then(r => r.json()),
    fetch(`${base}/v1/graph/communities`).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
  ]);
  const intelRaw   = intelRes.status  === "fulfilled" ? intelRes.value  : {};
  const communities = (commRes.status === "fulfilled" ? (commRes.value?.items || commRes.value?.communities || commRes.value || []) : []);
  const risks       = (riskRes.status === "fulfilled" ? (riskRes.value?.items || riskRes.value || []) : []);

  const quakes = Array.isArray(intelRaw?.earthquakes) ? intelRaw.earthquakes : [];
  const crypto = Array.isArray(intelRaw?.crypto)      ? intelRaw.crypto      : [];
  const fx     = Array.isArray(intelRaw?.fx)          ? intelRaw.fx          : [];
  const events = [...quakes.map(q => ({ ...q, _type: "QUAKE" })),
                  ...crypto.map(c => ({ ...c, _type: "CRYPTO" })),
                  ...fx.map(f => ({ ...f, _type: "FX" }))];

  const flagged = events.filter(ev => {
    const kws = keywords(evText(ev));
    return communities.some(c => scoreText(commText(c), kws) > 0) &&
           risks.some(r => scoreText(riskText(r), kws) > 0);
  }).length;
  const total = events.length;
  const flagPct = total ? Math.round((flagged / total) * 100) : 0;
  return `WTCMAP World Threat Cluster Map online, sir. I am correlating ${total} live world events across ${communities.length} network community clusters and ${risks.length} active risk signals. ${flagged} event${flagged === 1 ? "" : "s"} are cluster-flagged — matching both a network community and a risk signal, indicating amplified threat potential. That is ${flagPct}% of current live intelligence flagged at the network level. Recommend immediate review of cluster-flagged events.`;
}

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const PU     = "#A78BFA";
const OR     = "#F97316";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  CLUSTER_FLAGGED: RD,
  NETWORK_EXPOSED: PU,
  RISK_SIGNALED:   AM,
  CLEAR:           GR,
};

const SEV_COLOR = {
  critical: RD,
  high:     AM,
  medium:   PU,
  low:      GR,
};

const TYPE_COLOR = {
  QUAKE:  OR,
  CRYPTO: CY,
  FX:     GR,
};

const TABS = ["ALL", "CLUSTER_FLAGGED", "NETWORK_EXPOSED", "RISK_SIGNALED", "CLEAR"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function evText(ev) {
  return [ev.place, ev.location, ev.name, ev.symbol, ev.pair, ev.description, ev.title, ev.type, ev._type].filter(Boolean).join(" ");
}
function commText(c) {
  return [c.name, c.title, c.description, c.label, c.tags, c.cluster_id, c.members?.join(" ")].filter(Boolean).join(" ");
}
function riskText(r) {
  return [r.name, r.title, r.description, r.type, r.sector, r.tags, r.source, r.category].filter(Boolean).join(" ");
}

function classify(ev, communities, risks) {
  const kws = keywords(evText(ev));
  const matchedComm = communities
    .map(c => ({ ...c, _score: scoreText(commText(c), kws) }))
    .filter(c => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const matchedRisk = risks
    .map(r => ({ ...r, _score: scoreText(riskText(r), kws) }))
    .filter(r => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const hasComm = matchedComm.length > 0;
  const hasRisk = matchedRisk.length > 0;
  let cls;
  if (hasComm && hasRisk)  cls = "CLUSTER_FLAGGED";
  else if (hasComm)        cls = "NETWORK_EXPOSED";
  else if (hasRisk)        cls = "RISK_SIGNALED";
  else                     cls = "CLEAR";
  return { ...ev, _cls: cls, _comm: matchedComm, _risk: matchedRisk };
}

export default function WorldThreatClusterMap() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [events, setEvents]         = useState([]);
  const [communities, setCommunities] = useState([]);
  const [risks, setRisks]           = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [brief, setBrief]           = useState("");
  const [assessing, setAssessing]   = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [intelRes, commRes, riskRes] = await Promise.allSettled([
        fetch(`${base}/functions/getLiveIntel`).then(r => r.json()),
        fetch(`${base}/v1/graph/communities`).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const intelRaw = intelRes.status === "fulfilled" ? intelRes.value : {};
      const comm     = commRes.status  === "fulfilled" ? (commRes.value?.items || commRes.value?.communities || commRes.value || []) : [];
      const rk       = riskRes.status  === "fulfilled" ? (riskRes.value?.items || riskRes.value || []) : [];

      const quakes = Array.isArray(intelRaw?.earthquakes) ? intelRaw.earthquakes : [];
      const crypto = Array.isArray(intelRaw?.crypto)      ? intelRaw.crypto      : [];
      const fx     = Array.isArray(intelRaw?.fx)          ? intelRaw.fx          : [];
      const evList = [...quakes.map(q => ({ ...q, _type: "QUAKE" })),
                      ...crypto.map(c => ({ ...c, _type: "CRYPTO" })),
                      ...fx.map(f => ({ ...f, _type: "FX" }))];

      setEvents(evList);
      setCommunities(comm);
      setRisks(rk);
      setClassified(evList.map(ev => classify(ev, comm, rk)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:wtcmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:wtcmap-toggle", onToggle);
  }, []);

  const clusterFlagged = classified.filter(c => c._cls === "CLUSTER_FLAGGED").length;
  const networkExposed = classified.filter(c => c._cls === "NETWORK_EXPOSED").length;
  const riskSignaled   = classified.filter(c => c._cls === "RISK_SIGNALED").length;
  const clear          = classified.filter(c => c._cls === "CLEAR").length;
  const total          = classified.length;
  const flagPct        = total ? Math.round((clusterFlagged / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || evText(c).toLowerCase().includes(search.toLowerCase()));

  const assess = async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const base = apiBase();
      const ctx = `LiveEvents:${total} Communities:${communities.length} RiskSignals:${risks.length} ClusterFlagged:${clusterFlagged} NetworkExposed:${networkExposed} RiskSignaled:${riskSignaled} Clear:${clear} FlaggedPct:${flagPct}%`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `In 2 sentences, assess the world threat cluster map and network-amplified risk exposure: ${ctx}` }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      if (txt) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: txt }),
        }).then(async res => {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(() => {});
        }).catch(() => {});
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Live Intel × Graph Community × RiskSignal World Threat Cluster Map (WTCMAP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? RD : "rgba(5,8,13,0.85)",
          border: `1px solid ${RD}`,
          color: open ? "#fff" : RD,
          fontFamily: FONT, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          boxShadow: clusterFlagged > 0 ? `0 0 8px ${RD}88` : "none",
          whiteSpace: "nowrap",
        }}
      >
        ◈ WTCMAP
        {clusterFlagged > 0 && (
          <span style={{
            marginLeft: 4, background: RD, color: "#fff",
            borderRadius: 8, fontSize: 8, padding: "0 4px", fontWeight: 700,
          }}>{clusterFlagged}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.max(8, BTN_LEFT - 300),
          zIndex: Z_INDEX + 100, width: 820, maxHeight: "82vh",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 8, fontFamily: FONT, fontSize: 11,
          color: "#DCEBF5", overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: `0 0 40px rgba(0,207,255,0.12)`,
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: RD, fontWeight: 700, letterSpacing: 2 }}>WTCMAP</span>
              <span style={{ color: "#6B7280", marginLeft: 8, fontSize: 10 }}>Live Intel × Graph Community × RiskSignal — World Threat Cluster</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "8px 14px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${BORDER}` }}>
            {[
              { label: "LIVE EVENTS",      val: events.length,      clr: OR },
              { label: "COMMUNITIES",      val: communities.length, clr: PU },
              { label: "RISK SIGNALS",     val: risks.length,       clr: RD },
              { label: "CLUSTER FLAGGED",  val: clusterFlagged,     clr: RD },
              { label: "NETWORK EXPOSED",  val: networkExposed,     clr: PU },
              { label: "RISK SIGNALED",    val: riskSignaled,       clr: AM },
              { label: "CLEAR",            val: clear,              clr: GR },
              { label: "FLAGGED%",         val: `${flagPct}%`,      clr: flagPct > 20 ? RD : flagPct > 5 ? AM : GR },
            ].map(t => (
              <div key={t.label} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${t.clr}33`,
                borderRadius: 4, padding: "4px 8px", minWidth: 80, textAlign: "center",
              }}>
                <div style={{ color: t.clr, fontSize: 14, fontWeight: 700 }}>{loading ? "…" : t.val}</div>
                <div style={{ color: "#6B7280", fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          {!loading && total > 0 && (
            <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ height: 4, background: "#1e2936", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${flagPct}%`, background: flagPct > 20 ? RD : AM, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
            </div>
          )}

          {/* Controls */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? RD : "rgba(0,0,0,0.4)",
                border: `1px solid ${tab === t ? RD : "#334155"}`,
                color: tab === t ? "#fff" : "#94A3B8",
                fontFamily: FONT, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
              }}>{t.replace(/_/g, " ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search events…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid #334155`,
                color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px", borderRadius: 3,
                width: 160, outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {error && <div style={{ color: RD, padding: 8 }}>Error: {error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: "#6B7280", padding: 12, textAlign: "center" }}>No events match current filter.</div>
            )}
            {visible.map((ev, i) => {
              const clr   = CLASS_COLOR[ev._cls] || GR;
              const tclr  = TYPE_COLOR[ev._type] || CY;
              const isExp = expanded === i;
              const label = ev.place || ev.name || ev.symbol || ev.pair || ev.title || "World Event";
              return (
                <div key={i} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                      background: "rgba(0,0,0,0.3)", borderRadius: 4,
                      border: `1px solid ${isExp ? clr : "transparent"}`,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ color: tclr, fontSize: 8, border: `1px solid ${tclr}33`, borderRadius: 2, padding: "0 4px", minWidth: 44, textAlign: "center" }}>{ev._type}</span>
                    <span style={{ color: clr, fontSize: 9, letterSpacing: 1, minWidth: 130 }}>{ev._cls.replace(/_/g, " ")}</span>
                    <span style={{ flex: 1, color: "#DCEBF5", fontSize: 10 }}>{label}</span>
                    {(ev.mag || ev.magnitude) && <span style={{ color: OR, fontSize: 8 }}>M{ev.mag || ev.magnitude}</span>}
                    {(ev.change_pct !== undefined) && <span style={{ color: ev.change_pct >= 0 ? GR : RD, fontSize: 8 }}>{ev.change_pct >= 0 ? "+" : ""}{ev.change_pct?.toFixed(2)}%</span>}
                    <span style={{ color: "#334155", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "0 0 4px 4px", marginTop: 1 }}>
                      {ev._comm.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>NETWORK COMMUNITIES ({ev._comm.length})</div>
                          {ev._comm.map((c, k) => (
                            <div key={k} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(167,139,250,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{c.name || c.label || c.cluster_id || "Community"}</span>
                                <span style={{ color: PU, fontSize: 8, border: `1px solid ${PU}33`, borderRadius: 2, padding: "0 3px" }}>CLUSTER</span>
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (c._score / 5) * 100)}%`, background: PU, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {ev._risk.length > 0 && (
                        <div>
                          <div style={{ color: RD, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>RISK SIGNALS ({ev._risk.length})</div>
                          {ev._risk.map((r, k) => (
                            <div key={k} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(239,68,68,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{r.name || r.title || "Risk Signal"}</span>
                                {r.severity && <span style={{ color: SEV_COLOR[(r.severity || "").toLowerCase()] || AM, fontSize: 8, border: `1px solid ${SEV_COLOR[(r.severity || "").toLowerCase()] || AM}33`, borderRadius: 2, padding: "0 3px" }}>{r.severity}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (r._score / 5) * 100)}%`, background: RD, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {ev._comm.length === 0 && ev._risk.length === 0 && (
                        <div style={{ color: "#6B7280", fontSize: 10, padding: "4px 0" }}>No network community or risk signal match — event clear.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "#1e2936" : RD, color: assessing ? "#6B7280" : "#fff",
                border: "none", fontFamily: FONT, fontSize: 9, letterSpacing: 1,
                padding: "4px 12px", borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS WORLD THREATS"}
            </button>
            {brief && <div style={{ flex: 1, color: "#94A3B8", fontSize: 10, lineHeight: 1.4 }}>{brief}</div>}
            <span style={{ color: "#334155", fontSize: 9, marginLeft: "auto" }}>
              auto-refresh 5m · /functions/getLiveIntel · /v1/graph/communities · /entities/RiskSignal
            </span>
          </div>
        </div>
      )}
    </>
  );
}
