/**
 * F101 — Graph Community × Investigation × RiskSignal
 *         Network Threat Index (GCNITX)
 *
 * Parallel-fetches /v1/graph/communities + /v1/investigations +
 *   /entities/RiskSignal.
 * Keyword-correlates each graph community's member entity IDs against
 * investigation titles/descriptions AND risk signal titles/descriptions
 * to classify:
 *   TRIPLE_THREAT       (investigation + risk match)
 *   INVESTIGATION_LINKED (investigation only)
 *   RISK_FLAGGED        (risk only)
 *   CLEAR               (no match)
 *
 * Red pulse badge on triple-threat count.
 * Stat tiles COMMUNITIES / INVESTIGATIONS / RISK SIGNALS + all classes.
 * Amber badge on triple-threat count.
 * Filter tabs ALL/TRIPLE_THREAT/INVESTIGATION_LINKED/RISK_FLAGGED/CLEAR + text search.
 * Expand community → matched investigation cards (cyan) + risk signal cards
 *   (red, severity badge) with relevance bars.
 * ▶ ASSESS NETWORK THREAT → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "gcnitx/graph community threat/network threat index/
 *   community investigation/community risk/network investigation risk/
 *   graph threat network/graph community risk".
 * Event: jarvis:gcnitx-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 999_480;
const Z_INDEX  = 163;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const GCNITX_RE = /\b(gcnitx|graph[\s-]community[\s-]threat|network[\s-]threat[\s-]index|community[\s-]investigation|community[\s-]risk|network[\s-]investigation[\s-]risk|graph[\s-]threat[\s-]network|graph[\s-]community[\s-]risk|threat[\s-]network[\s-]index|community[\s-]threat[\s-]index)\b/i;

const CY  = "#00CFFF";
const GR  = "#22C55E";
const AM  = "#F59E0B";
const RD  = "#EF4444";
const BL  = "#3B82F6";
const PU  = "#A855F7";
const BG  = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  TRIPLE_THREAT:        RD,
  INVESTIGATION_LINKED: CY,
  RISK_FLAGGED:         AM,
  CLEAR:                GR,
};

const TABS = ["ALL","TRIPLE_THREAT","INVESTIGATION_LINKED","RISK_FLAGGED","CLEAR"];
const TAB_LABELS = {
  ALL:                  "ALL",
  TRIPLE_THREAT:        "TRIPLE THREAT",
  INVESTIGATION_LINKED: "INV. LINKED",
  RISK_FLAGGED:         "RISK FLAGGED",
  CLEAR:                "CLEAR",
};

const SEV_COLOR = { critical: RD, high: AM, medium: "#FACC15", low: GR };

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isGcnitxQuery(text) {
  return GCNITX_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const at = new Set(kwTokens(aStr));
  const bt = kwTokens(bStr);
  if (!at.size || !bt.length) return 0;
  return bt.filter(w => at.has(w)).length / Math.max(at.size, bt.length);
}

function invStr(inv) {
  return [inv.title, inv.description, inv.status, inv.type,
    (inv.tags || []).join(" ")].join(" ");
}

function riskStr(r) {
  return [r.title, r.description, r.type, r.category,
    (r.tags || []).join(" ")].join(" ");
}

// Build a keyword string from member entity IDs (use whitespace-separated IDs as tokens)
function communityStr(community) {
  return community.members.join(" ");
}

const THRESHOLD = 0.04;

async function fetchAll() {
  const base = apiBase();
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [commRaw, invRaw, riskRaw] = await Promise.all([
    fetch(`${base}/v1/graph/communities`, { headers }).then(r => r.json()),
    fetch(`${base}/v1/investigations`, { headers }).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`, { headers }).then(r => r.json()),
  ]);

  // Parse communities into cluster objects
  const commObj = typeof commRaw?.communities === "object" ? commRaw.communities : {};
  const clusterMap = {};
  for (const [entityId, clusterId] of Object.entries(commObj)) {
    const key = String(clusterId);
    if (!clusterMap[key]) clusterMap[key] = [];
    clusterMap[key].push(String(entityId));
  }
  const communities = Object.entries(clusterMap)
    .map(([id, members]) => ({ id: Number(id), members, size: members.length, label: `Community ${id}` }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 30); // cap for performance

  const investigations = norm(invRaw,  ["investigations","items","data","results"]);
  const signals        = norm(riskRaw, ["risk_signals","signals","items","data","results"]);
  return { communities, investigations, signals };
}

function classify(communities, investigations, signals) {
  return communities.map(comm => {
    const cs = communityStr(comm);
    const invMatches  = investigations.map(inv => ({ ...inv, rel: overlap(cs, invStr(inv))  })).filter(x => x.rel >= THRESHOLD).sort((a,b) => b.rel - a.rel).slice(0,4);
    const riskMatches = signals.map(r        => ({ ...r,   rel: overlap(cs, riskStr(r))    })).filter(x => x.rel >= THRESHOLD).sort((a,b) => b.rel - a.rel).slice(0,4);
    const hasInv  = invMatches.length > 0;
    const hasRisk = riskMatches.length > 0;
    let cls;
    if (hasInv && hasRisk) cls = "TRIPLE_THREAT";
    else if (hasInv)       cls = "INVESTIGATION_LINKED";
    else if (hasRisk)      cls = "RISK_FLAGGED";
    else                   cls = "CLEAR";
    return { ...comm, cls, invMatches, riskMatches };
  });
}

export async function buildGcnitxScript() {
  const { communities, investigations, signals } = await fetchAll();
  const classified = classify(communities, investigations, signals);
  const total   = classified.length;
  const triple  = classified.filter(c => c.cls === "TRIPLE_THREAT").length;
  const invOnly = classified.filter(c => c.cls === "INVESTIGATION_LINKED").length;
  const riskOnly= classified.filter(c => c.cls === "RISK_FLAGGED").length;
  const clear   = classified.filter(c => c.cls === "CLEAR").length;
  const pct     = total ? Math.round(((total - triple) / total) * 100) : 0;

  if (!total) return "No graph community data available at this time, sir.";

  return `GCNITX network threat index online, sir. Analysed ${total} graph communit${total === 1 ? "y" : "ies"} ` +
    `against ${investigations.length} active investigations and ${signals.length} risk signals. ` +
    `${triple} communit${triple === 1 ? "y" : "ies"} classified as TRIPLE THREAT — linked to both open investigations and active risk signals. ` +
    `${invOnly} investigation-linked, ${riskOnly} risk-flagged, ${clear} clear. ` +
    `Network threat exposure at ${100 - pct} percent. Recommend immediate review of triple-threat clusters, sir.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function GraphCommunityNetworkThreatIndex() {
  const [open, setOpen]       = useState(false);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { communities, investigations, signals } = await fetchAll();
      const classified = classify(communities, investigations, signals);
      setData({ classified, investigations, signals });
    } catch (e) {
      setError(e.message || "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:gcnitx-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcnitx-toggle", onToggle);
  }, []);

  const classified = data?.classified ?? [];
  const total   = classified.length;
  const triple  = classified.filter(c => c.cls === "TRIPLE_THREAT").length;
  const invOnly = classified.filter(c => c.cls === "INVESTIGATION_LINKED").length;
  const riskOnly= classified.filter(c => c.cls === "RISK_FLAGGED").length;
  const clear   = classified.filter(c => c.cls === "CLEAR").length;

  const visible = classified.filter(c => {
    if (tab !== "ALL" && c.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!`community ${c.id} ${c.members.join(" ")}`.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const summary = `${total} graph communities analysed: ${triple} triple-threat (inv+risk), ` +
        `${invOnly} investigation-linked, ${riskOnly} risk-flagged, ${clear} clear.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `GCNITX network threat index: ${summary} Provide a 2-sentence threat assessment of the most dangerous graph community clusters.` }),
      });
      const d = await r.json();
      const b = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment complete.";
      setBrief(b);
      // TTS
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: b, voice: "onyx" }),
      }).then(async res => {
        if (!res.ok) return;
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
        audio.onended = () => URL.revokeObjectURL(url);
      }).catch(() => {});
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const tile = (label, value, color) => (
    <div key={label} style={{ background: "rgba(0,207,255,0.06)", border: `1px solid ${color}44`,
      borderRadius: 6, padding: "6px 10px", minWidth: 80, textAlign: "center" }}>
      <div style={{ color, fontSize: 18, fontWeight: 700 }}>{value}</div>
      <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1, marginTop: 1 }}>{label}</div>
    </div>
  );

  const relBar = (rel) => (
    <div style={{ height: 3, background: "#162030", borderRadius: 2, marginTop: 3, width: "100%" }}>
      <div style={{ height: 3, borderRadius: 2, background: CY, width: `${Math.round(rel * 100)}%`, transition: "width 0.4s" }} />
    </div>
  );

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Graph Community Network Threat Index (GCNITX)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? RD : "rgba(6,11,22,0.82)",
          border: `1px solid ${RD}88`, borderRadius: 5, color: open ? "#04060A" : RD,
          fontFamily: FONT, fontSize: 9, letterSpacing: 1, padding: "4px 7px",
          cursor: "pointer", boxShadow: open ? `0 0 18px ${RD}66` : "none",
          whiteSpace: "nowrap",
        }}>
        ◈ GCNITX
        {triple > 0 && (
          <span style={{
            marginLeft: 4, background: RD, color: "#fff", borderRadius: 8,
            padding: "0 5px", fontSize: 8, animation: "gcnitx-pulse 1.4s ease-in-out infinite",
          }}>{triple}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", right: 18, top: 60, zIndex: Z_INDEX + 1,
          width: "min(680px,94vw)", maxHeight: "82vh", overflowY: "auto",
          background: BG, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: "16px 18px", fontFamily: FONT, color: "#DCEBF5",
          boxShadow: `0 0 60px ${RD}22`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ color: RD, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>◈ GCNITX</span>
            <span style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>
              GRAPH COMMUNITY × INVESTIGATION × RISK SIGNAL NETWORK THREAT INDEX
            </span>
            <button onClick={() => setOpen(false)} style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "#6E8AA0", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Stat tiles */}
          {data && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {tile("COMMUNITIES",  total,    CY)}
              {tile("INVESTIGATIONS", data.investigations.length, BL)}
              {tile("RISK SIGNALS",  data.signals.length, RD)}
              {tile("TRIPLE THREAT", triple,  RD)}
              {tile("INV. LINKED",   invOnly, CY)}
              {tile("RISK FLAGGED",  riskOnly, AM)}
              {tile("CLEAR",         clear,   GR)}
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CLASS_COLOR[t] ?? CY : "rgba(0,207,255,0.07)",
                border: `1px solid ${tab === t ? (CLASS_COLOR[t] ?? CY) : "#1E3044"}`,
                color: tab === t ? "#04060A" : "#6E8AA0",
                borderRadius: 4, padding: "3px 8px", fontSize: 9, cursor: "pointer",
                fontFamily: FONT, letterSpacing: 1,
              }}>{TAB_LABELS[t] || t}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search member IDs…"
              style={{
                marginLeft: "auto", background: "rgba(0,207,255,0.05)",
                border: "1px solid #1E3044", borderRadius: 4, color: "#DCEBF5",
                fontFamily: FONT, fontSize: 10, padding: "3px 8px", width: 160,
              }}/>
          </div>

          {/* Assess button */}
          <button onClick={assess} disabled={assessing || !data} style={{
            marginBottom: 12, background: "rgba(0,207,255,0.08)",
            border: `1px solid ${CY}44`, borderRadius: 5, color: CY,
            fontFamily: FONT, fontSize: 9, letterSpacing: 1, padding: "4px 12px",
            cursor: assessing ? "wait" : "pointer",
          }}>
            {assessing ? "◌ ASSESSING…" : "▶ ASSESS NETWORK THREAT"}
          </button>
          {brief && (
            <div style={{ background: "rgba(0,207,255,0.06)", border: `1px solid ${CY}33`,
              borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 11,
              color: "#DCEBF5", lineHeight: 1.5 }}>
              {brief}
            </div>
          )}

          {/* Loading / error */}
          {loading && <div style={{ color: "#6E8AA0", fontSize: 10 }}>◌ loading…</div>}
          {error   && <div style={{ color: RD, fontSize: 10 }}>⚠ {error}</div>}

          {/* Community rows */}
          {visible.map(comm => {
            const col = CLASS_COLOR[comm.cls] || CY;
            const isExp = !!expanded[comm.id];
            return (
              <div key={comm.id} style={{
                marginBottom: 6, borderRadius: 7,
                border: `1px solid ${col}33`, background: "rgba(0,207,255,0.03)",
              }}>
                <div
                  onClick={() => setExpanded(ex => ({ ...ex, [comm.id]: !ex[comm.id] }))}
                  style={{
                    padding: "8px 12px", cursor: "pointer", display: "flex",
                    alignItems: "center", gap: 8,
                  }}>
                  <span style={{ color: col, fontSize: 9, fontWeight: 700, minWidth: 120, letterSpacing: 1 }}>
                    {comm.label}
                  </span>
                  <span style={{ color: "#6E8AA0", fontSize: 9 }}>
                    {comm.size} node{comm.size !== 1 ? "s" : ""}
                  </span>
                  <span style={{
                    marginLeft: "auto", background: `${col}22`, color: col,
                    borderRadius: 4, padding: "2px 7px", fontSize: 9, letterSpacing: 1,
                    border: `1px solid ${col}44`,
                  }}>{comm.cls.replace(/_/g, " ")}</span>
                  <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 12px 10px" }}>
                    {/* Member preview */}
                    <div style={{ fontSize: 9, color: "#6E8AA0", marginBottom: 6 }}>
                      Members: {comm.members.slice(0,8).join(", ")}{comm.members.length > 8 ? ` …+${comm.members.length - 8}` : ""}
                    </div>

                    {/* Matched investigations */}
                    {comm.invMatches.length > 0 && (
                      <>
                        <div style={{ fontSize: 9, color: BL, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ INVESTIGATIONS ({comm.invMatches.length})
                        </div>
                        {comm.invMatches.map((inv, i) => (
                          <div key={i} style={{
                            background: "rgba(59,130,246,0.08)", border: `1px solid ${BL}33`,
                            borderRadius: 5, padding: "5px 9px", marginBottom: 4,
                          }}>
                            <div style={{ color: BL, fontSize: 10, fontWeight: 600 }}>{inv.title || inv.id || "Investigation"}</div>
                            {inv.status && <div style={{ color: "#6E8AA0", fontSize: 9 }}>{inv.status}</div>}
                            {relBar(inv.rel)}
                            <div style={{ color: "#6E8AA0", fontSize: 8, marginTop: 1 }}>
                              relevance {Math.round(inv.rel * 100)}%
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Matched risk signals */}
                    {comm.riskMatches.length > 0 && (
                      <>
                        <div style={{ fontSize: 9, color: RD, letterSpacing: 1, marginBottom: 4, marginTop: 4 }}>
                          ◈ RISK SIGNALS ({comm.riskMatches.length})
                        </div>
                        {comm.riskMatches.map((sig, i) => {
                          const sc = SEV_COLOR[(sig.severity || "").toLowerCase()] || AM;
                          return (
                            <div key={i} style={{
                              background: "rgba(239,68,68,0.08)", border: `1px solid ${RD}33`,
                              borderRadius: 5, padding: "5px 9px", marginBottom: 4,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: RD, fontSize: 10, fontWeight: 600 }}>{sig.title || sig.id || "Signal"}</span>
                                {sig.severity && (
                                  <span style={{
                                    background: `${sc}22`, color: sc, fontSize: 8,
                                    borderRadius: 3, padding: "1px 5px", border: `1px solid ${sc}44`,
                                  }}>{sig.severity.toUpperCase()}</span>
                                )}
                              </div>
                              {sig.description && (
                                <div style={{ color: "#6E8AA0", fontSize: 9 }}>
                                  {String(sig.description).slice(0, 80)}{sig.description.length > 80 ? "…" : ""}
                                </div>
                              )}
                              {relBar(sig.rel)}
                              <div style={{ color: "#6E8AA0", fontSize: 8, marginTop: 1 }}>
                                relevance {Math.round(sig.rel * 100)}%
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}

                    {comm.invMatches.length === 0 && comm.riskMatches.length === 0 && (
                      <div style={{ color: GR, fontSize: 9 }}>◎ no active threats correlated</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!loading && visible.length === 0 && data && (
            <div style={{ color: "#6E8AA0", fontSize: 10 }}>no communities match the current filter</div>
          )}
        </div>
      )}

      <style>{`
        @keyframes gcnitx-pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.6; transform:scale(1.15); }
        }
      `}</style>
    </>
  );
}
