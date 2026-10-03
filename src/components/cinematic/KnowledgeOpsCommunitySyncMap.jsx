/**
 * F162 — Knowledge × Ops Event × Graph Community Intelligence Synchrony Map (KOGSYNC)
 *
 * Answers: "Which knowledge articles are grounded in live operational events
 *           AND referenced by network community clusters — and which are isolated
 *           with no cross-domain context?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /knowledge/           → KB articles (title/content/tags/category/date)
 *   GET /v1/ops/events        → live ops events (name/description/type/status)
 *   GET /v1/graph/communities → graph community clusters (name/description/members/tags)
 *
 * Classification per KB article (keyword correlation):
 *   FULLY_SYNCHRONIZED — matched both an ops event AND a community cluster
 *   OPS_TRACKED        — matched an ops event, no community
 *   COMMUNITY_MAPPED   — matched a community, no ops event
 *   ISOLATED           — matched neither (knowledge blind spot)
 *
 * Stat tiles: KB ARTICLES / OPS EVENTS / COMMUNITIES + four class counts + SYNC%
 * Amber badge on ISOLATED count.
 * Synchrony coverage bar.
 * ▶ ASSESS SYNCHRONY: 2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ KOGSYNC  at left:1033080, bottom:8, zIndex:223.
 * Event:   jarvis:kogsync-toggle
 * Voice:   "kogsync / knowledge ops sync / knowledge synchrony / knowledge community /
 *           synchronized knowledge / knowledge isolation"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const TEAL   = "#00CFB4";
const PURPLE = "#A259FF";
const BLUE   = "#3B82F6";
const MUTED  = "#6E8AA0";
const BG     = "rgba(4,7,14,0.96)";
const MONO   = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1033080;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const KOGSYNC_RE =
  /\b(kogsync|knowledge ops sync|knowledge synchrony|knowledge community|synchronized knowledge|knowledge isolation)\b/i;

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of [
      "items","results","data","records","articles","events","communities",
      "entries","list","knowledge","ops","clusters",
    ]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
  }
  return [];
}

function words(obj) {
  return Object.values(obj || {})
    .filter(v => typeof v === "string")
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3);
}

function overlap(a, b) {
  const wa = new Set(words(a));
  const wb = words(b);
  return wb.filter(w => wa.has(w)).length;
}

function classify(article, opsEvents, communities) {
  const thr = 1;
  const matchedOps = opsEvents
    .map(ev => ({ item: ev, score: overlap(article, ev) }))
    .filter(x => x.score >= thr)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const matchedComm = communities
    .map(c => ({ item: c, score: overlap(article, c) }))
    .filter(x => x.score >= thr)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const hasOps  = matchedOps.length > 0;
  const hasComm = matchedComm.length > 0;
  let cls;
  if (hasOps && hasComm)       cls = "FULLY_SYNCHRONIZED";
  else if (hasOps && !hasComm) cls = "OPS_TRACKED";
  else if (hasComm && !hasOps) cls = "COMMUNITY_MAPPED";
  else                         cls = "ISOLATED";

  return { ...article, cls, matchedOps, matchedComm };
}

// ─── exported voice helpers ───────────────────────────────────────────────────

export function isKogsyncQuery(q) {
  return KOGSYNC_RE.test(q || "");
}

export async function buildKogsyncScript() {
  const base = apiBase();
  const hdr  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [kbR, opR, cmR] = await Promise.all([
    fetch(`${base}/knowledge/`,          { headers: hdr }),
    fetch(`${base}/v1/ops/events`,       { headers: hdr }),
    fetch(`${base}/v1/graph/communities`,{ headers: hdr }),
  ]);
  const [kbD, opD, cmD] = await Promise.all([kbR.json(), opR.json(), cmR.json()]);
  const articles     = normArr(kbD);
  const opsEvents    = normArr(opD);
  const communities  = normArr(cmD);
  const classified   = articles.map(a => classify(a, opsEvents, communities));
  const isolated     = classified.filter(x => x.cls === "ISOLATED").length;
  const synced       = classified.filter(x => x.cls === "FULLY_SYNCHRONIZED").length;
  const pct          = articles.length ? Math.round((synced / articles.length) * 100) : 0;
  const prompt =
    `We have ${articles.length} knowledge articles, ${opsEvents.length} ops events, ${communities.length} graph communities. ` +
    `${synced} articles are fully synchronized (ops + community), ${isolated} are isolated with no cross-domain grounding. ` +
    `Synchrony coverage: ${pct}%. In 2 sentences: which isolated articles pose the highest knowledge-gap risk and why.`;
  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST", headers: hdr,
    body: JSON.stringify({ message: prompt }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
    `KOGSYNC online. ${isolated} knowledge articles are isolated — no ops event or community context. Synchrony coverage is ${pct}%.`;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function KnowledgeOpsCommunitySyncMap() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [articles, setArticles]     = useState([]);
  const [opsCount, setOpsCount]     = useState(0);
  const [commCount, setCommCount]   = useState(0);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [brief, setBrief]           = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const [kbR, opR, cmR] = await Promise.all([
        fetch(`${base}/knowledge/`,          { headers: hdr }),
        fetch(`${base}/v1/ops/events`,       { headers: hdr }),
        fetch(`${base}/v1/graph/communities`,{ headers: hdr }),
      ]);
      const [kbD, opD, cmD] = await Promise.all([kbR.json(), opR.json(), cmR.json()]);
      const rawArticles    = normArr(kbD);
      const rawOps         = normArr(opD);
      const rawCommunities = normArr(cmD);
      setOpsCount(rawOps.length);
      setCommCount(rawCommunities.length);
      setArticles(rawArticles.map(a => classify(a, rawOps, rawCommunities)));
    } catch {
      // keep previous state on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(prev => !prev);
    window.addEventListener("jarvis:kogsync-toggle", handler);
    return () => window.removeEventListener("jarvis:kogsync-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildKogsyncScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak", { detail: script }));
    } catch {
      setBrief("Unable to assess knowledge synchrony at this time.");
    } finally {
      setAssessing(false);
    }
  }, []);

  const TABS = ["ALL", "FULLY_SYNCHRONIZED", "OPS_TRACKED", "COMMUNITY_MAPPED", "ISOLATED"];

  const filtered = articles.filter(art => {
    if (tab !== "ALL" && art.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return Object.values(art).some(v => typeof v === "string" && v.toLowerCase().includes(q));
    }
    return true;
  });

  const counts = {
    FULLY_SYNCHRONIZED: articles.filter(x => x.cls === "FULLY_SYNCHRONIZED").length,
    OPS_TRACKED:        articles.filter(x => x.cls === "OPS_TRACKED").length,
    COMMUNITY_MAPPED:   articles.filter(x => x.cls === "COMMUNITY_MAPPED").length,
    ISOLATED:           articles.filter(x => x.cls === "ISOLATED").length,
  };
  const isolatedCount = counts.ISOLATED;
  const syncPct = articles.length
    ? Math.round((counts.FULLY_SYNCHRONIZED / articles.length) * 100)
    : 0;

  const clsColor = {
    FULLY_SYNCHRONIZED: GREEN,
    OPS_TRACKED:        BLUE,
    COMMUNITY_MAPPED:   PURPLE,
    ISOLATED:           AMBER,
  };
  const clsLabel = {
    FULLY_SYNCHRONIZED: "FULLY SYNCHRONIZED",
    OPS_TRACKED:        "OPS TRACKED",
    COMMUNITY_MAPPED:   "COMMUNITY MAPPED",
    ISOLATED:           "ISOLATED",
  };

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 223,
          background: open ? `${AMBER}22` : "rgba(4,7,14,0.85)",
          border: `1px solid ${open ? AMBER : CY}44`,
          color: open ? AMBER : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          padding: "4px 9px", borderRadius: 5, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ KOGSYNC
        {isolatedCount > 0 && (
          <span style={{
            marginLeft: 5, background: AMBER, color: "#000",
            borderRadius: "50%", padding: "0 4px", fontSize: 8,
          }}>
            {isolatedCount}
          </span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 44, left: BTN_LEFT - 560, zIndex: 9223,
          width: 620, maxHeight: "72vh",
          background: BG,
          border: `1px solid ${CY}33`,
          borderRadius: 10, padding: "16px 18px",
          fontFamily: MONO, color: "#C8DCE8",
          overflowY: "auto",
          boxShadow: `0 0 32px ${CY}18`,
        }}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ KOGSYNC</span>
              <span style={{ color: MUTED, fontSize: 10, marginLeft: 10 }}>
                Knowledge × Ops Event × Graph Community Synchrony Map
              </span>
            </div>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { label: "KB ARTICLES",   val: articles.length,         col: CY     },
              { label: "OPS EVENTS",    val: opsCount,                col: BLUE   },
              { label: "COMMUNITIES",   val: commCount,               col: PURPLE },
              { label: "SYNCHRONIZED",  val: counts.FULLY_SYNCHRONIZED, col: GREEN  },
              { label: "OPS TRACKED",   val: counts.OPS_TRACKED,      col: BLUE   },
              { label: "COMM MAPPED",   val: counts.COMMUNITY_MAPPED, col: PURPLE },
              { label: "ISOLATED",      val: counts.ISOLATED,         col: AMBER  },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: "#080E18", border: `1px solid ${col}33`,
                borderRadius: 6, padding: "6px 10px", textAlign: "center", minWidth: 80,
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: MUTED, fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* synchrony coverage bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 9, color: MUTED, letterSpacing: 1 }}>SYNCHRONY COVERAGE</span>
              <span style={{ fontSize: 10, color: syncPct >= 50 ? GREEN : AMBER }}>{syncPct}%</span>
            </div>
            <div style={{ height: 4, background: "#0A1828", borderRadius: 2 }}>
              <div style={{
                width: `${syncPct}%`, height: "100%",
                background: syncPct >= 50 ? GREEN : AMBER,
                borderRadius: 2,
              }} />
            </div>
          </div>

          {/* search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search articles…"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#080E18", border: `1px solid ${CY}22`,
              color: "#C8DCE8", fontFamily: MONO, fontSize: 10,
              padding: "5px 8px", borderRadius: 5, marginBottom: 8,
              outline: "none",
            }}
          />

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : CY + "44"}`,
                  color: tab === t ? CY : MUTED,
                  fontFamily: MONO, fontSize: 8, letterSpacing: 1,
                  padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                }}>
                {t === "ALL" ? "ALL" : clsLabel[t]}
                {t !== "ALL" && ` (${counts[t]})`}
              </button>
            ))}
          </div>

          {loading && (
            <div style={{ color: MUTED, fontSize: 10, textAlign: "center", padding: 16 }}>
              loading…
            </div>
          )}

          {/* article list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map((art, idx) => {
              const color  = clsColor[art.cls];
              const isExp  = expanded === idx;
              const title  = art.title || art.name || art.headline || `Article ${idx + 1}`;
              const snippet = art.summary || art.content || art.description || art.body || "";
              return (
                <div key={idx} style={{
                  background: "#080E18",
                  border: `1px solid ${color}33`,
                  borderRadius: 7, padding: "9px 12px",
                  cursor: "pointer",
                }} onClick={() => setExpanded(isExp ? null : idx)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#DCE8F0", fontSize: 11 }}>{title}</span>
                    <span style={{
                      color: color, fontSize: 8, letterSpacing: 1,
                      background: `${color}18`, border: `1px solid ${color}44`,
                      padding: "2px 6px", borderRadius: 3,
                    }}>{clsLabel[art.cls]}</span>
                  </div>
                  {snippet && (
                    <div style={{ color: MUTED, fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>
                      {snippet.slice(0, 90)}{snippet.length > 90 ? "…" : ""}
                    </div>
                  )}

                  {/* expanded detail */}
                  {isExp && (
                    <div style={{ marginTop: 10 }}>
                      {art.matchedOps.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ color: BLUE, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            ◆ OPS EVENTS ({art.matchedOps.length})
                          </div>
                          {art.matchedOps.map(({ item, score }, oi) => {
                            const name = item.name || item.title || item.type || item.id || `Event ${oi + 1}`;
                            const type = item.type || item.status || "";
                            const pct  = Math.min(100, score * 20);
                            return (
                              <div key={oi} style={{
                                background: "#050A12",
                                border: `1px solid ${BLUE}22`,
                                borderRadius: 5, padding: "5px 8px", marginBottom: 4,
                              }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ color: BLUE, fontSize: 10 }}>{name}</span>
                                  {type && <span style={{
                                    color: MUTED, fontSize: 8,
                                    background: `${BLUE}18`, padding: "1px 5px", borderRadius: 3,
                                  }}>{type}</span>}
                                </div>
                                <div style={{ height: 2, background: "#0A1828", borderRadius: 1, marginTop: 4 }}>
                                  <div style={{ width: `${pct}%`, height: "100%", background: BLUE, borderRadius: 1 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {art.matchedComm.length > 0 && (
                        <div>
                          <div style={{ color: PURPLE, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            ◆ COMMUNITIES ({art.matchedComm.length})
                          </div>
                          {art.matchedComm.map(({ item, score }, ci) => {
                            const name = item.name || item.label || item.cluster || item.id || `Community ${ci + 1}`;
                            const pct  = Math.min(100, score * 20);
                            return (
                              <div key={ci} style={{
                                background: "#050A12",
                                border: `1px solid ${PURPLE}22`,
                                borderRadius: 5, padding: "5px 8px", marginBottom: 4,
                              }}>
                                <div style={{ display: "flex", alignItems: "center" }}>
                                  <span style={{ color: PURPLE, fontSize: 10 }}>{name}</span>
                                </div>
                                <div style={{ height: 2, background: "#0A1828", borderRadius: 1, marginTop: 4 }}>
                                  <div style={{ width: `${pct}%`, height: "100%", background: PURPLE, borderRadius: 1 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && !loading && (
            <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: 24 }}>
              No articles match current filter.
            </div>
          )}

          {/* assess button + brief */}
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={assess} disabled={assessing}
              style={{
                background: assessing ? "#0A1A28" : `${TEAL}22`,
                border: `1px solid ${TEAL}66`, color: TEAL,
                fontFamily: MONO, fontSize: 10, letterSpacing: 1,
                padding: "5px 14px", borderRadius: 5, cursor: assessing ? "default" : "pointer",
              }}>
              {assessing ? "assessing…" : "▶ ASSESS SYNCHRONY"}
            </button>
            {brief && (
              <div style={{
                flex: 1, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
                background: "#080E18", border: `1px solid ${CY}22`,
                borderRadius: 5, padding: "6px 10px",
              }}>{brief}</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
