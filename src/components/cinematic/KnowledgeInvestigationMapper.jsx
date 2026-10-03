import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#00E5FF";
const AM = "#FFB300";
const GR = "#4CAF50";
const DIM = "#6E8AA0";
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT = 981_000;

// ── Query matchers exported for JarvisBrain ───────────────────────────────
const KIMAP_RE = /\b(kimap|knowledge[\s_-]*investigation|knowledge[\s_-]*coverage|orphaned[\s_-]*knowledge|knowledge[\s_-]*support|investigation[\s_-]*knowledge|knowledge[\s_-]*map|knowledge[\s_-]*link|supporting[\s_-]*knowledge|unsupported[\s_-]*knowledge)\b/i;
export function isKimapQuery(q) { return KIMAP_RE.test(q); }

function keywords(str = "") {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function relevance(article, investigation) {
  const akw = keywords(
    `${article.title || ""} ${article.content || article.summary || ""} ${article.category || ""} ${(article.tags || []).join(" ")}`
  );
  const ikw = keywords(
    `${investigation.title || investigation.name || ""} ${investigation.description || ""} ${investigation.type || ""} ${(investigation.tags || []).join(" ")}`
  );
  if (!akw.length || !ikw.length) return 0;
  const shared = akw.filter(w => ikw.includes(w));
  return shared.length / Math.max(akw.length, ikw.length);
}

export async function buildKimapScript() {
  const base = apiBase();
  const [knRes, invRes] = await Promise.allSettled([
    fetch(`${base}/knowledge/`).then(r => r.json()),
    fetch(`${base}/v1/investigations`).then(r => r.json()),
  ]);

  const articles = knRes.status === "fulfilled"
    ? (knRes.value?.items || knRes.value || []) : [];
  const investigations = invRes.status === "fulfilled"
    ? (invRes.value?.items || invRes.value || []) : [];

  const supporting = articles.filter(a => investigations.some(i => relevance(a, i) > 0));
  const orphaned   = articles.filter(a => !investigations.some(i => relevance(a, i) > 0));

  const snapshot =
    `Knowledge articles: ${articles.length} total, ${supporting.length} supporting active investigations, ` +
    `${orphaned.length} orphaned (no investigation link). Active investigations: ${investigations.length}.`;

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message: `Knowledge-investigation coverage analysis. Provide exactly 2 sentences: assessment of knowledge base alignment with active investigations, and recommended action for orphaned articles. Data: ${snapshot}`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim()
    || `${supporting.length} of ${articles.length} knowledge articles support active investigations. ${orphaned.length} orphaned articles are unlinked and may represent unused intelligence.`;
}

// ── Component ─────────────────────────────────────────────────────────────
export default function KnowledgeInvestigationMapper() {
  const [open, setOpen]         = useState(false);
  const [articles, setArticles] = useState([]);
  const [investigations, setInvs] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]       = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    const base = apiBase();
    const [knRes, invRes] = await Promise.allSettled([
      fetch(`${base}/knowledge/`).then(r => r.json()),
      fetch(`${base}/v1/investigations`).then(r => r.json()),
    ]);
    const artList = knRes.status === "fulfilled"
      ? (knRes.value?.items || knRes.value || []) : [];
    const invList = invRes.status === "fulfilled"
      ? (invRes.value?.items || invRes.value || []) : [];
    setArticles(artList);
    setInvs(invList);

    const enrichedList = artList.map(art => {
      const matches = invList
        .map(inv => ({ ...inv, score: relevance(art, inv) }))
        .filter(inv => inv.score > 0)
        .sort((a, b) => b.score - a.score);
      return { ...art, matches, supporting: matches.length > 0 };
    });
    setEnriched(enrichedList);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:kimap-toggle", toggle);
    return () => window.removeEventListener("jarvis:kimap-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const supporting = enriched.filter(a => a.supporting);
  const orphaned   = enriched.filter(a => !a.supporting);
  const orphanedCount = orphaned.length;

  const visible = enriched.filter(a => {
    const matchesTab =
      tab === "ALL" ? true :
      tab === "SUPPORTING" ? a.supporting :
      !a.supporting;
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      (a.title || "").toLowerCase().includes(q) ||
      (a.category || "").toLowerCase().includes(q) ||
      (a.summary || a.content || "").toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  async function assess() {
    setAssess(true);
    setBrief("");
    try {
      const script = await buildKimapScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch {
      setBrief("Unable to generate assessment at this time.");
    }
    setAssess(false);
  }

  const TABS = ["ALL", "SUPPORTING", "ORPHANED"];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Knowledge × Investigation Coverage Mapper (KIMAP)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 129,
          padding: "3px 9px", fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          background: "rgba(5,8,13,0.8)", border: `1px solid ${open ? CY : "#334"}`,
          color: open ? CY : DIM, cursor: "pointer", borderRadius: 4, letterSpacing: 1,
        }}
      >
        {orphanedCount > 0 && (
          <span style={{
            display: "inline-block", marginRight: 5, background: AM, color: "#000",
            borderRadius: 8, padding: "0 5px", fontSize: 9, fontWeight: 700
          }}>{orphanedCount}</span>
        )}
        ◈ KIMAP
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, top: 60, zIndex: 129, width: "min(680px, 92vw)",
          maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column",
          background: "rgba(6,10,16,0.93)", border: `1px solid ${CY}44`, borderRadius: 12,
          backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px 8px", borderBottom: `1px solid #1a2230`,
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap"
          }}>
            <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ KNOWLEDGE × INVESTIGATION MAPPER</span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
              {enriched.length} articles · {investigations.length} investigations
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 16, lineHeight: 1
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 16px 0", flexWrap: "wrap" }}>
            {[
              { label: "ARTICLES",    val: enriched.length,     color: CY },
              { label: "INVESTIGATIONS", val: investigations.length, color: CY },
              { label: "SUPPORTING",  val: supporting.length,   color: GR },
              { label: "ORPHANED",    val: orphaned.length,     color: orphaned.length > 0 ? AM : GR },
            ].map(s => (
              <div key={s.label} style={{
                flex: "1 1 100px", background: "rgba(0,229,255,0.04)",
                border: `1px solid ${s.color}33`, borderRadius: 8, padding: "6px 10px", textAlign: "center"
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 6, padding: "10px 16px 6px", alignItems: "center", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "3px 10px", fontSize: 10, borderRadius: 4, cursor: "pointer",
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : "#334"}`,
                color: tab === t ? CY : DIM, letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search articles…"
              style={{
                marginLeft: "auto", background: "rgba(0,229,255,0.05)",
                border: `1px solid #334`, borderRadius: 4, padding: "3px 8px",
                fontSize: 11, color: "#DCEBF5", outline: "none", width: 160,
              }}
            />
            <button onClick={assess} disabled={assessing} style={{
              padding: "3px 10px", fontSize: 10, borderRadius: 4, cursor: "pointer",
              background: assessing ? `${AM}22` : `${CY}15`,
              border: `1px solid ${assessing ? AM : CY}`,
              color: assessing ? AM : CY, letterSpacing: 1,
            }}>{assessing ? "…" : "▶ ASSESS"}</button>
            <button onClick={load} style={{
              padding: "3px 8px", fontSize: 10, borderRadius: 4, cursor: "pointer",
              background: "transparent", border: `1px solid #334`, color: DIM,
            }}>↺</button>
          </div>

          {brief && (
            <div style={{
              margin: "0 16px 8px", padding: "8px 12px", fontSize: 11, color: "#DCEBF5",
              background: `${CY}0a`, border: `1px solid ${CY}33`, borderRadius: 6, lineHeight: 1.5
            }}>{brief}</div>
          )}

          {/* Article list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 16px 12px" }}>
            {visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", paddingTop: 24 }}>
                {enriched.length === 0 ? "Loading knowledge articles…" : "No articles match this filter."}
              </div>
            )}
            {visible.map((art, i) => {
              const id = art.id || art._id || i;
              const isExp = expanded === id;
              const statusColor = art.supporting ? GR : AM;
              const statusLabel = art.supporting ? "SUPPORTING" : "ORPHANED";
              return (
                <div key={id} style={{
                  marginBottom: 6, borderRadius: 7, overflow: "hidden",
                  border: `1px solid ${statusColor}${isExp ? "88" : "33"}`,
                  background: art.supporting ? "rgba(76,175,80,0.04)" : "rgba(255,179,0,0.04)",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : id)}
                    style={{
                      padding: "8px 12px", cursor: "pointer", display: "flex",
                      alignItems: "center", gap: 8
                    }}
                  >
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: 1,
                      color: statusColor, background: `${statusColor}22`,
                      padding: "1px 6px", borderRadius: 3
                    }}>{statusLabel}</span>
                    <span style={{ flex: 1, fontSize: 11, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {art.title || art.name || `Article ${id}`}
                    </span>
                    {art.category && (
                      <span style={{ fontSize: 9, color: DIM, letterSpacing: 0.5 }}>{art.category}</span>
                    )}
                    <span style={{ color: DIM, fontSize: 10, marginLeft: 4 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "0 12px 10px", borderTop: `1px solid #1a2230` }}>
                      {art.summary || art.content ? (
                        <p style={{ fontSize: 10, color: DIM, margin: "6px 0", lineHeight: 1.5 }}>
                          {(art.summary || art.content || "").slice(0, 200)}{((art.summary || art.content || "").length > 200) ? "…" : ""}
                        </p>
                      ) : null}
                      {art.matches && art.matches.length > 0 ? (
                        <>
                          <div style={{ fontSize: 10, color: GR, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED INVESTIGATIONS ({art.matches.length})
                          </div>
                          {art.matches.slice(0, 4).map((inv, j) => (
                            <div key={j} style={{
                              padding: "5px 8px", marginBottom: 4, borderRadius: 5,
                              background: "rgba(76,175,80,0.06)", border: `1px solid ${GR}33`,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>
                                  {inv.title || inv.name || `Investigation ${j + 1}`}
                                </span>
                                {inv.status && (
                                  <span style={{ fontSize: 9, color: DIM }}>{inv.status}</span>
                                )}
                              </div>
                              <div style={{ marginTop: 4 }}>
                                <div style={{
                                  height: 3, background: `${GR}33`, borderRadius: 2, overflow: "hidden"
                                }}>
                                  <div style={{
                                    height: "100%", borderRadius: 2,
                                    width: `${Math.round(inv.score * 100)}%`,
                                    background: GR,
                                  }} />
                                </div>
                                <span style={{ fontSize: 8, color: DIM }}>
                                  relevance {Math.round(inv.score * 100)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ fontSize: 10, color: AM, marginTop: 6 }}>
                          ⚠ No matched investigations — article is orphaned
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
