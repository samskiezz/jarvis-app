/**
 * F227 — Dataset × Graph Community × Knowledge × Investigation Coverage Intelligence Map (DGKIMAP)
 *
 * Parallel-fetches /v1/datasets + /v1/graph/communities + /knowledge/ + /v1/investigations
 * and keyword-correlates each dataset against community clusters, KB articles, and investigations:
 *
 *   FULLY_COVERED  — matched community + KB + investigation (complete coverage)
 *   DUAL_COVERED   — matched any two of the three sources
 *   SINGLE_LINKED  — matched exactly one source
 *   DARK           — no matches (data intelligence gap)
 *
 * Stat tiles: DATASETS / COMMUNITIES / KB ARTICLES / INVESTIGATIONS + four class counts + COVERAGE%.
 * Amber badge on DARK count.
 * Filter tabs ALL / FULLY_COVERED / DUAL_COVERED / SINGLE_LINKED / DARK + text search.
 * Expand dataset → matched community cards (blue) + KB article cards (green) + investigation cards (cyan).
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:dgkimap-toggle event.
 *
 * Voice triggers:
 *   "dgkimap / dataset coverage / dataset intelligence / data investigation /
 *    dark dataset / data knowledge coverage / dataset community"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_069_480;
const Z_INDEX  = 288;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const DGKIMAP_RE = /\b(dgkimap|dataset[\s-]coverage|dataset[\s-]intelligence|data[\s-]investigation|dark[\s-]dataset|data[\s-]knowledge[\s-]coverage|dataset[\s-]community)\b/i;

export function isDgkimapQuery(q = "") { return DGKIMAP_RE.test(q); }

export async function buildDgkimapScript() {
  const base = apiBase();
  const [dR, cR, kR, iR] = await Promise.allSettled([
    fetch(`${base}/v1/datasets`).then(r => r.json()),
    fetch(`${base}/v1/graph/communities`).then(r => r.json()),
    fetch(`${base}/knowledge/`).then(r => r.json()),
    fetch(`${base}/v1/investigations`).then(r => r.json()),
  ]);
  const datasets  = dR.status === "fulfilled" ? (dR.value?.items || dR.value?.datasets || dR.value || []) : [];
  const comms     = cR.status === "fulfilled" ? (cR.value?.items || cR.value?.communities || cR.value || []) : [];
  const kb        = kR.status === "fulfilled" ? (kR.value?.items || kR.value?.articles || kR.value || []) : [];
  const invs      = iR.status === "fulfilled" ? (iR.value?.items || iR.value?.investigations || iR.value || []) : [];

  let fullyCovered = 0, dark = 0;
  for (const ds of datasets) {
    const kws   = keywords(datasetText(ds));
    const hasCom = comms.some(c => scoreText(communityText(c), kws) > 0);
    const hasKb  = kb.some(a => scoreText(articleText(a), kws) > 0);
    const hasInv = invs.some(v => scoreText(invText(v), kws) > 0);
    const hits   = [hasCom, hasKb, hasInv].filter(Boolean).length;
    if (hits === 3) fullyCovered++;
    else if (hits === 0) dark++;
  }
  const total    = datasets.length;
  const coverage = total ? Math.round((fullyCovered / total) * 100) : 0;
  return `DGKIMAP Dataset Graph Intelligence Coverage Map online, sir. I have cross-referenced ${total} datasets against ${comms.length} graph community clusters, ${kb.length} knowledge base articles, and ${invs.length} active investigations. ${fullyCovered} datasets are fully covered with community network linkage, knowledge base support, and investigation backing, representing ${coverage}% complete dataset intelligence coverage. ${dark} datasets are completely dark — no graph community, knowledge base, or investigation coverage whatsoever — these represent critical data intelligence gaps requiring immediate analyst attention, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const BL   = "#3B82F6";
const TE   = "#14B8A6";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_COVERED: GR,
  DUAL_COVERED:  CY,
  SINGLE_LINKED: BL,
  DARK:          AM,
};

const TABS = ["ALL", "FULLY_COVERED", "DUAL_COVERED", "SINGLE_LINKED", "DARK"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function datasetText(d) {
  return [d.name, d.title, d.description, d.type, d.category, d.tags, d.source].filter(Boolean).join(" ");
}
function communityText(c) {
  return [c.name, c.label, c.description, c.tags, c.type].filter(Boolean).join(" ");
}
function articleText(a) {
  return [a.title, a.content, a.summary, a.tags, a.category].filter(Boolean).join(" ");
}
function invText(v) {
  return [v.title, v.name, v.description, v.status, v.tags, v.type].filter(Boolean).join(" ");
}

function classify(ds, comms, kb, invs) {
  const kws = keywords(datasetText(ds));
  const matchedCom = comms.map(c => ({ ...c, _score: scoreText(communityText(c), kws) })).filter(c => c._score > 0).sort((a, b) => b._score - a._score).slice(0, 4);
  const matchedKb  = kb.map(a => ({ ...a, _score: scoreText(articleText(a), kws) })).filter(a => a._score > 0).sort((a, b) => b._score - a._score).slice(0, 4);
  const matchedInv = invs.map(v => ({ ...v, _score: scoreText(invText(v), kws) })).filter(v => v._score > 0).sort((a, b) => b._score - a._score).slice(0, 4);

  const hits = [matchedCom.length > 0, matchedKb.length > 0, matchedInv.length > 0].filter(Boolean).length;
  let cls;
  if (hits === 3)      cls = "FULLY_COVERED";
  else if (hits === 2) cls = "DUAL_COVERED";
  else if (hits === 1) cls = "SINGLE_LINKED";
  else                 cls = "DARK";

  return { ...ds, _cls: cls, _com: matchedCom, _kb: matchedKb, _inv: matchedInv };
}

function smallBtn(col) {
  return {
    fontFamily: FONT, fontSize: 10, background: "transparent",
    border: `1px solid ${col}55`, color: col, padding: "2px 7px",
    borderRadius: 3, cursor: "pointer",
  };
}

function RelevanceBar({ score, max, col }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#1A2A3A", borderRadius: 2, marginTop: 3, width: "100%" }}>
      <div style={{ height: 3, width: pct + "%", background: col, borderRadius: 2, transition: "width 0.4s" }} />
    </div>
  );
}

export default function DatasetGraphIntelMap() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [comms, setComms]       = useState([]);
  const [kb, setKb]             = useState([]);
  const [invs, setInvs]         = useState([]);
  const [classified, setClass]  = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [dR, cR, kR, iR] = await Promise.allSettled([
        fetch(`${base}/v1/datasets`).then(r => r.json()),
        fetch(`${base}/v1/graph/communities`).then(r => r.json()),
        fetch(`${base}/knowledge/`).then(r => r.json()),
        fetch(`${base}/v1/investigations`).then(r => r.json()),
      ]);
      const ds = dR.status === "fulfilled" ? (dR.value?.items || dR.value?.datasets || dR.value || []) : [];
      const cs = cR.status === "fulfilled" ? (cR.value?.items || cR.value?.communities || cR.value || []) : [];
      const ks = kR.status === "fulfilled" ? (kR.value?.items || kR.value?.articles || kR.value || []) : [];
      const is = iR.status === "fulfilled" ? (iR.value?.items || iR.value?.investigations || iR.value || []) : [];
      setDatasets(ds);
      setComms(cs);
      setKb(ks);
      setInvs(is);
      setClass(ds.map(d => classify(d, cs, ks, is)));
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
    window.addEventListener("jarvis:dgkimap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dgkimap-toggle", onToggle);
  }, []);

  const fullyCovered = classified.filter(c => c._cls === "FULLY_COVERED").length;
  const dualCovered  = classified.filter(c => c._cls === "DUAL_COVERED").length;
  const singleLinked = classified.filter(c => c._cls === "SINGLE_LINKED").length;
  const dark         = classified.filter(c => c._cls === "DARK").length;
  const total        = classified.length;
  const coveragePct  = total ? Math.round((fullyCovered / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || datasetText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `DGKIMAP: ${total} datasets — FULLY_COVERED: ${fullyCovered}, DUAL_COVERED: ${dualCovered}, SINGLE_LINKED: ${singleLinked}, DARK: ${dark} (${coveragePct}% full coverage). Communities: ${comms.length}. KB articles: ${kb.length}. Investigations: ${invs.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `DGKIMAP dataset intelligence coverage assessment. Context: ${ctx}. Provide a 2-sentence brief identifying the most critical dark datasets and what community, knowledge base, or investigation coverage should be established to close the data intelligence gaps. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      const tts = await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      });
      if (tts.ok) {
        const blob = await tts.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch (e) {
      setBrief("Assessment unavailable: " + e.message);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Dataset × Graph Community × Knowledge × Investigation Coverage Intelligence Map (DGKIMAP)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${CY}55`,
          color: CY, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {dark > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {dark}
          </span>
        )}
        ◈ DGKIMAP
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: Z_INDEX,
      background: BG, fontFamily: FONT, overflowY: "auto", padding: "18px 20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ DGKIMAP</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Dataset × Graph Community × Knowledge × Investigation — Coverage Intelligence Map
        </span>
        {loading && <span style={{ color: CY, fontSize: 10 }}>◌ loading…</span>}
        <button onClick={load} style={smallBtn(CY)} title="Refresh">↺</button>
        <button onClick={() => setOpen(false)} style={smallBtn(RD)}>✕</button>
      </div>

      {error && (
        <div style={{ color: RD, fontSize: 11, marginBottom: 10, padding: "6px 10px", border: `1px solid ${RD}44`, borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          ["DATASETS",       total,           CY],
          ["COMMUNITIES",    comms.length,    BL],
          ["KB ARTICLES",    kb.length,       GR],
          ["INVESTIGATIONS", invs.length,     TE],
          ["FULLY COVERED",  fullyCovered,    GR],
          ["DUAL COVERED",   dualCovered,     CY],
          ["SINGLE LINKED",  singleLinked,    BL],
          ["DARK",           dark,            AM],
          ["COVERAGE%",      coveragePct + "%", coveragePct >= 70 ? GR : coveragePct >= 40 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 85, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#4A6A80", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#4A6A80", letterSpacing: 1, marginBottom: 3 }}>
          FULL DATASET INTELLIGENCE COVERAGE — {coveragePct}%
        </div>
        <div style={{ height: 6, background: "#0D1825", borderRadius: 3 }}>
          <div style={{
            height: 6, borderRadius: 3, transition: "width 0.6s",
            width: coveragePct + "%",
            background: coveragePct >= 70 ? GR : coveragePct >= 40 ? AM : RD,
          }} />
        </div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          ...smallBtn(CY), fontSize: 11, padding: "4px 12px",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS COVERAGE"}
        </button>
        {brief && (
          <div style={{ color: "#DCEBF5", fontSize: 11, lineHeight: 1.5, flex: 1, minWidth: 200 }}>
            {brief}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            ...smallBtn(tab === t ? CY : "#4A6A80"),
            background: tab === t ? CY + "22" : "transparent",
          }}>
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search datasets…"
          style={{
            background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            borderRadius: 3, outline: "none", width: 180,
          }}
        />
        <span style={{ color: "#4A6A80", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} datasets
        </span>
      </div>

      {/* Dataset list */}
      {loading && !classified.length ? (
        <div style={{ color: "#4A6A80", fontSize: 11, padding: 20 }}>◌ loading datasets…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((ds, i) => {
            const col   = CLASS_COLOR[ds._cls] || "#6E8AA0";
            const isExp = expanded === i;
            const maxCom = ds._com[0]?._score || 1;
            const maxKb  = ds._kb[0]?._score || 1;
            const maxInv = ds._inv[0]?._score || 1;
            return (
              <div key={i} style={{
                border: `1px solid ${col}33`, borderRadius: 5,
                background: "rgba(0,207,255,0.02)", overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
                >
                  <span style={{
                    fontSize: 9, letterSpacing: 1, color: col,
                    border: `1px solid ${col}55`, borderRadius: 3, padding: "1px 5px",
                    whiteSpace: "nowrap",
                  }}>
                    {ds._cls}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ds.name || ds.title || `Dataset ${i + 1}`}
                  </span>
                  {ds.type && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{ds.type}</span>
                  )}
                  <span style={{ color: "#4A6A80", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 10px 10px" }}>
                    {(ds.description || ds.summary) && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>
                        {ds.description || ds.summary}
                      </div>
                    )}

                    {/* Matched communities */}
                    {ds._com.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: BL, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED COMMUNITIES ({ds._com.length})
                        </div>
                        {ds._com.map((c, ci) => (
                          <div key={ci} style={{ background: BL + "11", border: `1px solid ${BL}33`, borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: BL, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.name || c.label || `Community ${ci + 1}`}
                              </span>
                              {c.members !== undefined && (
                                <span style={{ fontSize: 8, color: BL, border: `1px solid ${BL}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {c.members} members
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={c._score} max={maxCom} col={BL} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched KB articles */}
                    {ds._kb.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED KNOWLEDGE BASE ({ds._kb.length})
                        </div>
                        {ds._kb.map((a, ai) => (
                          <div key={ai} style={{ background: GR + "11", border: `1px solid ${GR}33`, borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: GR, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {a.title || `Article ${ai + 1}`}
                              </span>
                              {a.category && (
                                <span style={{ fontSize: 8, color: GR, border: `1px solid ${GR}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {a.category}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={a._score} max={maxKb} col={GR} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched investigations */}
                    {ds._inv.length > 0 && (
                      <div>
                        <div style={{ color: TE, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED INVESTIGATIONS ({ds._inv.length})
                        </div>
                        {ds._inv.map((v, vi) => (
                          <div key={vi} style={{ background: TE + "11", border: `1px solid ${TE}33`, borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: TE, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {v.title || v.name || `Investigation ${vi + 1}`}
                              </span>
                              {v.status && (
                                <span style={{ fontSize: 8, color: TE, border: `1px solid ${TE}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {v.status}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={v._score} max={maxInv} col={TE} />
                          </div>
                        ))}
                      </div>
                    )}

                    {ds._cls === "DARK" && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, fontStyle: "italic", marginTop: 4 }}>
                        No matching community clusters, knowledge base articles, or investigations found. This dataset is completely dark — a critical data intelligence gap with no network, knowledge, or investigation coverage.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{ color: "#4A6A80", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
              No datasets match current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
