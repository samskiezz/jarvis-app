/**
 * F85 — Graph Community × Investment Coverage (GCINV)
 *
 * Parallel-fetches /v1/graph/communities + /entities/Investment, then
 * keyword-correlates each network cluster (label + member metadata) against
 * portfolio investments (name / sector / notes / tags / ticker) to surface:
 *
 *   PORTFOLIO-LINKED — investment domain overlaps this network community
 *   DARK             — no investment alignment (portfolio-network blind spot)
 *
 * Stat tiles: clusters / investments / portfolio-linked / dark
 * Filter tabs: ALL / PORTFOLIO-LINKED / DARK + text search
 * Expand cluster → matched investments with sector badge + relevance score
 * Amber badge on dark count
 *
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence portfolio-community coverage brief
 *            + TTS via jarvis:speak-dossier
 *
 * Toggle:  ◈ GCINV at bottom:8, left:693040, zIndex:266
 * Event:   jarvis:gcinv-toggle
 * Voice:   "graph community invest"/"community invest"/"gcinv"/"portfolio community"/
 *          "community portfolio"/"investment community"/"community investment alignment"
 * Refresh: 90 s
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const LIME  = "#84CC16";

const BTN_LEFT   = 693040;
const REFRESH_MS = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ── parse helpers ─────────────────────────────────────────────────────────────

function parseCommunities(raw) {
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw?.communities))  return raw.communities;
  if (Array.isArray(raw?.clusters))     return raw.clusters;
  if (Array.isArray(raw?.data))         return raw.data;
  return [];
}

function parseInvestments(raw) {
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw?.investments))  return raw.investments;
  if (Array.isArray(raw?.items))        return raw.items;
  if (Array.isArray(raw?.data))         return raw.data;
  return [];
}

// ── keyword correlation ───────────────────────────────────────────────────────

function tokenise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function relevanceScore(communityTokens, investmentText) {
  const iTokens = tokenise(investmentText);
  if (!communityTokens.length || !iTokens.length) return 0;
  const matches = communityTokens.filter(ct => iTokens.includes(ct));
  return Math.round((matches.length / Math.max(communityTokens.length, iTokens.length)) * 100);
}

function matchInvestments(community, investments) {
  const label   = community.label ?? community.name ?? community.id ?? "";
  const members = Array.isArray(community.members) ? community.members.join(" ") : "";
  const cType   = community.type ?? community.category ?? "";
  const cTokens = tokenise(`${label} ${members} ${cType}`);

  return investments
    .map(inv => {
      const iText = [inv.name, inv.title, inv.sector, inv.notes, inv.description,
                     inv.ticker, inv.tags, inv.category, inv.industry].filter(Boolean).join(" ");
      const score = relevanceScore(cTokens, iText);
      return score > 0 ? { ...inv, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

// ── JarvisBrain exports ───────────────────────────────────────────────────────

const GCINV_RE =
  /\b(graph\s+community\s+invest|community\s+invest|gcinv|portfolio\s+communit|communit\s+portfolio|investment\s+communit|communit\s+investment|community\s+portfolio\s+coverage|network\s+invest\s+coverage)\b/i;

export function isGcinvQuery(q) {
  return GCINV_RE.test(q || "");
}

export async function buildGcinvScript() {
  try {
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [commRaw, invRaw] = await Promise.all([
      fetch(`${apiBase()}/v1/graph/communities`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${apiBase()}/entities/Investment`,  { headers: hdrs }).then(r => r.json()).catch(() => []),
    ]);
    const communities = parseCommunities(commRaw);
    const investments = parseInvestments(invRaw);
    const linked = communities.filter(c => matchInvestments(c, investments).length > 0);
    const dark   = communities.filter(c => matchInvestments(c, investments).length === 0);
    const topDark = dark.slice(0, 3).map(c => c.label ?? c.name ?? c.id ?? "?").join(", ");
    return (
      `Graph Community × Investment Coverage: ${communities.length} network clusters checked against ${investments.length} portfolio investments. ` +
      `${linked.length} clusters are PORTFOLIO-LINKED (investment domain alignment detected). ` +
      `${dark.length} clusters are DARK (no investment exposure — portfolio-network blind spots). ` +
      `Top dark clusters: ${topDark || "none"}.`
    );
  } catch {
    return "Graph Community × Investment Coverage unavailable — check /v1/graph/communities and /entities/Investment endpoints.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function GraphCommunityInvestmentCoverage() {
  const [visible,   setVisible]  = useState(false);
  const [clusters,  setClusters] = useState([]);
  const [invs,      setInvs]     = useState([]);
  const [loading,   setLoading]  = useState(false);
  const [tab,       setTab]      = useState("ALL");
  const [search,    setSearch]   = useState("");
  const [expanded,  setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]    = useState("");
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [commRaw, invRaw] = await Promise.all([
        fetch(`${apiBase()}/v1/graph/communities`, { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${apiBase()}/entities/Investment`,  { headers: hdrs }).then(r => r.json()).catch(() => []),
      ]);
      setClusters(parseCommunities(commRaw));
      setInvs(parseInvestments(invRaw));
    } catch {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible(v => !v);
    window.addEventListener("jarvis:gcinv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcinv-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  const enriched = clusters.map(c => ({
    ...c,
    _matches: matchInvestments(c, invs),
  }));
  const linked   = enriched.filter(c => c._matches.length > 0);
  const dark     = enriched.filter(c => c._matches.length === 0);
  const badgeCount = dark.length;

  let rows = enriched;
  if (tab === "PORTFOLIO-LINKED") rows = linked;
  if (tab === "DARK")             rows = dark;
  if (search.trim()) {
    const q = search.toLowerCase();
    rows = rows.filter(r =>
      String(r.label ?? r.name ?? "").toLowerCase().includes(q) ||
      String(r.type  ?? r.category ?? "").toLowerCase().includes(q)
    );
  }

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildGcinvScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `${script} Give a 2-sentence portfolio-community coverage brief: which network communities have strong investment alignment, and which clusters represent the biggest portfolio-network blind spots.`,
        }),
      });
      const d = await r.json();
      const text = d.response || d.answer || d.text || d.content || script;
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment unavailable.");
    }
    setAssessing(false);
  }

  const clusterLabel = c => c.label ?? c.name ?? c.id ?? "Cluster";
  const invLabel     = i => i.name ?? i.title ?? i.ticker ?? i.id ?? "?";
  const invSector    = i => i.sector ?? i.industry ?? i.category ?? "";

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible(v => !v)}
        title="Graph Community × Investment Coverage (GCINV)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 266,
          background: visible ? `${AMBER}22` : "rgba(5,12,22,0.85)",
          border: `1px solid ${visible ? AMBER : AMBER + "55"}`,
          borderRadius: 6, color: visible ? AMBER : AMBER + "99",
          fontSize: 9, letterSpacing: 1.5, padding: "3px 7px",
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3,
          boxShadow: badgeCount > 0 ? `0 0 10px ${AMBER}44` : "none",
        }}
      >
        ◈ GCINV
        {badgeCount > 0 && (
          <span style={{
            background: AMBER, color: "#04060A", borderRadius: 3,
            padding: "0 4px", fontSize: 8, fontWeight: 700,
            minWidth: 14, textAlign: "center",
          }}>{badgeCount}</span>
        )}
      </button>

      {/* Panel */}
      {visible && (
        <div style={{
          position: "fixed", left: "50%", top: "50%",
          transform: "translate(-50%,-50%)",
          width: 660, maxHeight: "72vh", zIndex: 9217,
          background: "rgba(4,8,16,0.97)",
          border: `1px solid ${AMBER}44`,
          borderRadius: 12, overflow: "hidden",
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 60px ${AMBER}18, 0 20px 40px rgba(0,0,0,0.85)`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            borderBottom: `1px solid ${AMBER}33`,
            padding: "10px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${AMBER}` }}>
              ◈ GRAPH COMMUNITY × INVESTMENT COVERAGE
            </span>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {loading && <span style={{ color: "#4E6070", fontSize: 9 }}>SYNCING…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: "2px 9px", borderRadius: 3,
                  border: `1px solid ${AMBER}55`,
                  background: "transparent", color: AMBER,
                  cursor: "pointer", fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? "assessing…" : "▶ ASSESS"}</button>
              <button
                onClick={() => setVisible(false)}
                style={{ background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", flexShrink: 0 }}>
            {[
              { label: "CLUSTERS",         val: clusters.length, col: CY },
              { label: "INVESTMENTS",      val: invs.length,     col: LIME },
              { label: "PORTFOLIO-LINKED", val: linked.length,   col: GREEN },
              { label: "DARK",             val: dark.length,     col: AMBER },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, background: `${s.col}11`,
                border: `1px solid ${s.col}33`, borderRadius: 6,
                padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: s.col, fontSize: 15, fontWeight: 700 }}>{s.val}</div>
                <div style={{ color: s.col + "88", fontSize: 8, letterSpacing: 1.5, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs + search */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px 8px", flexShrink: 0 }}>
            {["ALL", "PORTFOLIO-LINKED", "DARK"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${AMBER}22` : "transparent",
                border: `1px solid ${tab === t ? AMBER : AMBER + "33"}`,
                borderRadius: 4, color: tab === t ? AMBER : AMBER + "66",
                fontSize: 9, letterSpacing: 1, padding: "2px 8px", cursor: "pointer",
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="filter clusters…"
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${AMBER}22`, borderRadius: 4,
                color: "#DCEBF5", fontSize: 10, padding: "2px 8px",
                outline: "none", width: 140, fontFamily: "inherit",
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 8px" }}>
            {rows.length === 0 && (
              <div style={{ color: "#2E4050", fontSize: 11, textAlign: "center", paddingTop: 32 }}>
                {loading ? "Loading…" : "No clusters match."}
              </div>
            )}
            {rows.map((row, i) => {
              const hasMatch = row._matches.length > 0;
              const isExp    = expanded === i;
              return (
                <div key={row.id ?? i} style={{ borderBottom: `1px solid ${AMBER}14` }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 0", cursor: "pointer",
                      background: isExp ? `${AMBER}08` : "transparent",
                    }}
                  >
                    <span style={{ color: hasMatch ? GREEN : AMBER, fontSize: 12, flexShrink: 0 }}>
                      {hasMatch ? "●" : "○"}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>
                      {clusterLabel(row)}
                    </span>
                    {row.type && (
                      <span style={{
                        background: `${CY}18`, border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "1px 5px", fontSize: 8, color: CY, letterSpacing: 1,
                      }}>{String(row.type).slice(0, 14)}</span>
                    )}
                    <span style={{
                      color: hasMatch ? GREEN + "88" : AMBER + "88",
                      fontSize: 9, letterSpacing: 1, flexShrink: 0,
                    }}>
                      {row._matches.length} INV
                    </span>
                    <span style={{ color: "#2E4050", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 20, paddingBottom: 8 }}>
                      {row._matches.length > 0 ? (
                        <>
                          <div style={{ color: AMBER + "88", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED INVESTMENTS
                          </div>
                          {row._matches.map((inv, j) => {
                            const sector = invSector(inv);
                            const pct    = Math.min(inv.score, 100);
                            return (
                              <div key={inv.id ?? j} style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "3px 0", borderBottom: `1px solid ${AMBER}0A`,
                              }}>
                                {sector && (
                                  <span style={{
                                    background: `${LIME}18`, border: `1px solid ${LIME}44`,
                                    borderRadius: 3, padding: "1px 4px", fontSize: 8, color: LIME, letterSpacing: 1,
                                  }}>{sector.slice(0, 12)}</span>
                                )}
                                <span style={{ color: "#7A95AB", fontSize: 10, flex: 1 }}>
                                  {invLabel(inv)}
                                </span>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <div style={{ width: 44, height: 4, background: "#1a2535", borderRadius: 2 }}>
                                    <div style={{ width: `${pct}%`, height: "100%", background: AMBER, borderRadius: 2 }} />
                                  </div>
                                  <span style={{ color: "#4E6070", fontSize: 8 }}>{pct}%</span>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div style={{ color: AMBER + "88", fontSize: 9, letterSpacing: 1 }}>
                          NO INVESTMENT ALIGNMENT — PORTFOLIO-NETWORK DARK SPOT
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Brief */}
          {brief && (
            <div style={{
              padding: "8px 14px", borderTop: `1px solid ${AMBER}22`,
              color: "#DCEBF5", fontSize: 11, lineHeight: 1.6, flexShrink: 0,
              background: `${AMBER}06`,
            }}>
              <span style={{ color: AMBER, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}

          {/* Footer */}
          <div style={{
            borderTop: `1px solid ${AMBER}18`,
            padding: "4px 14px",
            display: "flex", justifyContent: "space-between",
            color: "#2E4050", fontSize: 9, letterSpacing: 1, flexShrink: 0,
          }}>
            <span>GRAPH COMMUNITY × INVESTMENT COVERAGE</span>
            <span>{rows.length} CLUSTERS · {invs.length} INVESTMENTS</span>
          </div>
        </div>
      )}
    </>
  );
}
