/**
 * F189 — Graph Community × Dataset × Investigation Data Intelligence Coverage Nexus (GDINEX)
 *
 * Parallel-fetches /v1/graph/communities + /v1/datasets + /v1/investigations
 * and keyword-correlates each graph community cluster against datasets AND investigations
 * to classify:
 *
 *   FULLY_GROUNDED  — matched dataset + investigation (full intelligence grounding)
 *   DATA_BACKED     — dataset match only, no investigation backing
 *   INVESTIGATED    — investigation match only, no dataset backing
 *   UNGROUNDED      — no matches (community intelligence gap)
 *
 * Stat tiles: COMMUNITIES / DATASETS / INVESTIGATIONS + four class counts + GROUNDED%.
 * Amber badge on UNGROUNDED count.
 * Filter tabs ALL / FULLY_GROUNDED / DATA_BACKED / INVESTIGATED / UNGROUNDED + text search.
 * Expand community → matched dataset cards (teal) + investigation cards (cyan) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:gdinex-toggle event.
 *
 * Voice triggers:
 *   "gdinex / community data / graph community dataset / community investigation /
 *    ungrounded community / community intelligence / graph data nexus"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_048_200;
const Z_INDEX  = 250;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const GDINEX_RE = /\b(gdinex|community[\s-]data|graph[\s-]community[\s-]dataset|community[\s-]investigation|ungrounded[\s-]communit(?:y|ies)|community[\s-]intelligence|graph[\s-]data[\s-]nexus)\b/i;

export function isGdinexQuery(q = "") { return GDINEX_RE.test(q); }

export async function buildGdinexScript() {
  const base = apiBase();
  const [commRes, dataRes, invRes] = await Promise.allSettled([
    fetch(`${base}/v1/graph/communities`).then(r => r.json()),
    fetch(`${base}/v1/datasets`).then(r => r.json()),
    fetch(`${base}/v1/investigations`).then(r => r.json()),
  ]);
  const communities    = (commRes.status === "fulfilled" ? (commRes.value?.items    || commRes.value    || []) : []);
  const datasets       = (dataRes.status === "fulfilled" ? (dataRes.value?.items    || dataRes.value    || []) : []);
  const investigations = (invRes.status  === "fulfilled" ? (invRes.value?.items     || invRes.value     || []) : []);
  const ungrounded = communities.filter(c => {
    const kws = keywords(communityText(c));
    const hasDs = datasets.some(d => scoreText(datasetText(d), kws) > 0);
    const hasInv = investigations.some(i => scoreText(investText(i), kws) > 0);
    return !hasDs && !hasInv;
  }).length;
  const total   = communities.length;
  const grounded = total - ungrounded;
  const pct     = total ? Math.round((grounded / total) * 100) : 0;
  return `GDINEX Graph-Data-Investigation Nexus online, sir. I am correlating ${total} graph community clusters against ${datasets.length} datasets and ${investigations.length} active investigations. ${grounded} communities have data or investigation grounding — ${pct}% coverage. ${ungrounded} communit${ungrounded === 1 ? "y remains" : "ies remain"} ungrounded with no dataset or investigation backing. Recommend immediate data sourcing and investigation assignment for those network clusters.`;
}

const CY     = "#00CFFF";
const TE     = "#14B8A6";
const AM     = "#F59E0B";
const GR     = "#22C55E";
const RD     = "#EF4444";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_GROUNDED: GR,
  DATA_BACKED:    TE,
  INVESTIGATED:   CY,
  UNGROUNDED:     AM,
};

const TABS = ["ALL", "FULLY_GROUNDED", "DATA_BACKED", "INVESTIGATED", "UNGROUNDED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function communityText(c) {
  return [c.name, c.description, c.label, c.type, c.tags, c.members, c.topic].filter(Boolean).join(" ");
}
function datasetText(d) {
  return [d.name, d.description, d.title, d.type, d.tags, d.topic, d.category].filter(Boolean).join(" ");
}
function investText(i) {
  return [i.title, i.description, i.name, i.status, i.tags, i.priority, i.type].filter(Boolean).join(" ");
}

function classify(community, datasets, investigations) {
  const kws = keywords(communityText(community));
  const matchedDs = datasets
    .map(d => ({ ...d, _score: scoreText(datasetText(d), kws) }))
    .filter(d => d._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const matchedInv = investigations
    .map(i => ({ ...i, _score: scoreText(investText(i), kws) }))
    .filter(i => i._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const hasDs  = matchedDs.length > 0;
  const hasInv = matchedInv.length > 0;
  let cls;
  if (hasDs && hasInv) cls = "FULLY_GROUNDED";
  else if (hasDs)      cls = "DATA_BACKED";
  else if (hasInv)     cls = "INVESTIGATED";
  else                 cls = "UNGROUNDED";
  return { ...community, _cls: cls, _ds: matchedDs, _inv: matchedInv };
}

export default function GraphDatasetInvestigationNexus() {
  const [open, setOpen]                 = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [communities, setCommunities]   = useState([]);
  const [datasets, setDatasets]         = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [classified, setClassified]     = useState([]);
  const [tab, setTab]                   = useState("ALL");
  const [search, setSearch]             = useState("");
  const [expanded, setExpanded]         = useState(null);
  const [brief, setBrief]               = useState("");
  const [assessing, setAssessing]       = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [commRes, dataRes, invRes] = await Promise.allSettled([
        fetch(`${base}/v1/graph/communities`).then(r => r.json()),
        fetch(`${base}/v1/datasets`).then(r => r.json()),
        fetch(`${base}/v1/investigations`).then(r => r.json()),
      ]);
      const cm = commRes.status === "fulfilled" ? (commRes.value?.items || commRes.value || []) : [];
      const ds = dataRes.status === "fulfilled" ? (dataRes.value?.items || dataRes.value || []) : [];
      const iv = invRes.status  === "fulfilled" ? (invRes.value?.items  || invRes.value  || []) : [];
      setCommunities(cm);
      setDatasets(ds);
      setInvestigations(iv);
      setClassified(cm.map(c => classify(c, ds, iv)));
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
    window.addEventListener("jarvis:gdinex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gdinex-toggle", onToggle);
  }, []);

  const fullyGrounded = classified.filter(c => c._cls === "FULLY_GROUNDED").length;
  const dataBacked    = classified.filter(c => c._cls === "DATA_BACKED").length;
  const investigated  = classified.filter(c => c._cls === "INVESTIGATED").length;
  const ungrounded    = classified.filter(c => c._cls === "UNGROUNDED").length;
  const total         = classified.length;
  const groundedPct   = total ? Math.round(((fullyGrounded + dataBacked + investigated) / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || communityText(c).toLowerCase().includes(search.toLowerCase()));

  const assess = async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const base = apiBase();
      const ctx = `Communities:${total} Datasets:${datasets.length} Investigations:${investigations.length} FullyGrounded:${fullyGrounded} DataBacked:${dataBacked} Investigated:${investigated} Ungrounded:${ungrounded} GroundedCoverage:${groundedPct}%`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `In 2 sentences, assess graph community data-intelligence grounding gaps: ${ctx}` }),
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
          const url  = URL.createObjectURL(blob);
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
        title="Graph Community × Dataset × Investigation Data Intelligence Coverage Nexus (GDINEX)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? AM : "rgba(5,8,13,0.85)",
          border: `1px solid ${AM}`,
          color: open ? "#000" : AM,
          fontFamily: FONT, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          boxShadow: ungrounded > 0 ? `0 0 8px ${AM}88` : "none",
          whiteSpace: "nowrap",
        }}
      >
        ◈ GDINEX
        {ungrounded > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#000",
            borderRadius: 8, fontSize: 8, padding: "0 4px", fontWeight: 700,
          }}>{ungrounded}</span>
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
              <span style={{ color: AM, fontWeight: 700, letterSpacing: 2 }}>GDINEX</span>
              <span style={{ color: "#6B7280", marginLeft: 8, fontSize: 10 }}>Graph Community × Dataset × Investigation — Data Intelligence Coverage Nexus</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "8px 14px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${BORDER}` }}>
            {[
              { label: "COMMUNITIES",    val: communities.length,   clr: AM },
              { label: "DATASETS",       val: datasets.length,      clr: TE },
              { label: "INVESTIGATIONS", val: investigations.length, clr: CY },
              { label: "FULLY GROUNDED", val: fullyGrounded,         clr: GR },
              { label: "DATA BACKED",    val: dataBacked,            clr: TE },
              { label: "INVESTIGATED",   val: investigated,          clr: CY },
              { label: "UNGROUNDED",     val: ungrounded,            clr: AM },
              { label: "GROUNDED%",      val: `${groundedPct}%`,     clr: groundedPct >= 70 ? GR : groundedPct >= 40 ? AM : RD },
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
                <div style={{ height: "100%", width: `${groundedPct}%`, background: groundedPct >= 70 ? GR : groundedPct >= 40 ? AM : RD, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
            </div>
          )}

          {/* Controls */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? AM : "rgba(0,0,0,0.4)",
                border: `1px solid ${tab === t ? AM : "#334155"}`,
                color: tab === t ? "#000" : "#94A3B8",
                fontFamily: FONT, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
              }}>{t.replace(/_/g, " ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search communities…"
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
              <div style={{ color: "#6B7280", padding: 12, textAlign: "center" }}>No communities match current filter.</div>
            )}
            {visible.map((c, i) => {
              const clr   = CLASS_COLOR[c._cls] || AM;
              const isExp = expanded === i;
              return (
                <div key={c.id || i} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                      background: "rgba(0,0,0,0.3)", borderRadius: 4,
                      border: `1px solid ${isExp ? clr : "transparent"}`,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ color: clr, fontSize: 9, letterSpacing: 1, minWidth: 130 }}>{c._cls.replace(/_/g, " ")}</span>
                    <span style={{ flex: 1, color: "#DCEBF5", fontSize: 10 }}>{c.name || c.label || c.title || "Unknown Community"}</span>
                    {c.type && <span style={{ color: AM, fontSize: 8, border: `1px solid ${AM}44`, borderRadius: 2, padding: "0 4px" }}>{c.type}</span>}
                    <span style={{ color: "#334155", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "0 0 4px 4px", marginTop: 1 }}>
                      {c._ds.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: TE, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>DATASETS ({c._ds.length})</div>
                          {c._ds.map((d, k) => (
                            <div key={k} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(20,184,166,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{d.name || d.title || "Dataset"}</span>
                                {d.type && <span style={{ color: TE, fontSize: 8, border: `1px solid ${TE}33`, borderRadius: 2, padding: "0 3px" }}>{d.type}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (d._score / 5) * 100)}%`, background: TE, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {c._inv.length > 0 && (
                        <div>
                          <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>INVESTIGATIONS ({c._inv.length})</div>
                          {c._inv.map((inv, k) => (
                            <div key={k} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(0,207,255,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{inv.title || inv.name || "Investigation"}</span>
                                {inv.priority && <span style={{ color: CY, fontSize: 8, border: `1px solid ${CY}33`, borderRadius: 2, padding: "0 3px" }}>{inv.priority}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (inv._score / 5) * 100)}%`, background: CY, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {c._ds.length === 0 && c._inv.length === 0 && (
                        <div style={{ color: "#6B7280", fontSize: 10, padding: "4px 0" }}>No dataset or investigation coverage — community intelligence gap.</div>
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
                background: assessing ? "#1e2936" : AM, color: assessing ? "#6B7280" : "#000",
                border: "none", fontFamily: FONT, fontSize: 9, letterSpacing: 1,
                padding: "4px 12px", borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS COVERAGE"}
            </button>
            {brief && <div style={{ flex: 1, color: "#94A3B8", fontSize: 10, lineHeight: 1.4 }}>{brief}</div>}
            <span style={{ color: "#334155", fontSize: 9, marginLeft: "auto" }}>
              auto-refresh 90s · /v1/graph/communities · /v1/datasets · /v1/investigations
            </span>
          </div>
        </div>
      )}
    </>
  );
}
