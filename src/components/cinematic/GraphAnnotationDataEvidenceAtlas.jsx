/**
 * F196 — Graph Annotation × Dataset × Investigation Data Evidence Atlas (GADEVA)
 *
 * Parallel-fetches /v1/graph/annotations + /v1/datasets + /v1/investigations
 * and keyword-correlates each graph annotation against datasets AND investigations
 * to classify:
 *
 *   FULLY_EVIDENCED      — matched dataset + investigation (annotation fully grounded in data + case)
 *   DATASET_LINKED       — dataset present, no investigation link
 *   INVESTIGATION_LINKED — investigation present, no dataset grounding
 *   UNEVIDENCED          — neither (annotation floating with no data or case evidence)
 *
 * Stat tiles: ANNOTATIONS / DATASETS / INVESTIGATIONS + four class counts + EVIDENCED%.
 * Amber badge on UNEVIDENCED count.
 * Filter tabs ALL / FULLY_EVIDENCED / DATASET_LINKED / INVESTIGATION_LINKED / UNEVIDENCED + text search.
 * Expand annotation → matched dataset cards (purple) + investigation cards (cyan) with relevance bars.
 * ▶ ASSESS EVIDENCE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:gadeva-toggle event.
 *
 * Voice triggers:
 *   "gadeva / annotation evidence / graph evidence / unevidenced annotation /
 *    data annotation / annotation atlas / annotation dataset / annotation investigation"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_052_120;
const Z_INDEX  = 257;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const GADEVA_RE = /\b(gadeva|annotation[\s-]evidence|graph[\s-]evidence|unevidenced[\s-]annotation|data[\s-]annotation|annotation[\s-]atlas|annotation[\s-]dataset|annotation[\s-]investigation)\b/i;

export function isGadevaQuery(q = "") { return GADEVA_RE.test(q); }

export async function buildGadevaScript() {
  const base = apiBase();
  const [annRes, dsRes, invRes] = await Promise.allSettled([
    fetch(`${base}/v1/graph/annotations`).then(r => r.json()),
    fetch(`${base}/v1/datasets`).then(r => r.json()),
    fetch(`${base}/v1/investigations`).then(r => r.json()),
  ]);
  const annotations    = annRes.status === "fulfilled" ? (annRes.value?.items || annRes.value?.annotations || annRes.value || []) : [];
  const datasets       = dsRes.status  === "fulfilled" ? (dsRes.value?.items  || dsRes.value?.datasets     || dsRes.value  || []) : [];
  const investigations = invRes.status === "fulfilled" ? (invRes.value?.items || invRes.value?.investigations || invRes.value || []) : [];

  let fullyEvidenced = 0, unevidenced = 0;
  for (const a of annotations) {
    const kws   = keywords(annotationText(a));
    const hasDs = datasets.some(d       => scoreText(datasetText(d),  kws) > 0);
    const hasInv = investigations.some(i => scoreText(invText(i),     kws) > 0);
    if (hasDs && hasInv) fullyEvidenced++;
    else if (!hasDs && !hasInv) unevidenced++;
  }
  const total       = annotations.length;
  const evidencedPct = total ? Math.round((fullyEvidenced / total) * 100) : 0;
  return `GADEVA Data Evidence Atlas online, sir. I have cross-referenced ${total} graph annotations against ${datasets.length} datasets and ${investigations.length} open investigations. ${fullyEvidenced} annotations are fully evidenced with both dataset grounding and investigation backing, representing ${evidencedPct}% of the annotation layer. ${unevidenced} annotations are completely unevidenced — floating with no data or case linkage. Recommend triaging those unevidenced annotations for immediate dataset or investigation assignment, sir.`;
}

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const GR     = "#22C55E";
const PU     = "#A78BFA";
const CW     = "#67E8F9";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_EVIDENCED:      GR,
  DATASET_LINKED:       PU,
  INVESTIGATION_LINKED: CW,
  UNEVIDENCED:          AM,
};

const TABS = ["ALL", "FULLY_EVIDENCED", "DATASET_LINKED", "INVESTIGATION_LINKED", "UNEVIDENCED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function annotationText(a) {
  return [a.label, a.text, a.content, a.title, a.name, a.description, a.node_id, a.type, a.tags, a.category, a.author].filter(Boolean).join(" ");
}
function datasetText(d) {
  return [d.name, d.title, d.description, d.type, d.source, d.tags, d.category, d.owner].filter(Boolean).join(" ");
}
function invText(i) {
  return [i.title, i.name, i.description, i.status, i.priority, i.tags, i.type, i.category, i.assignee].filter(Boolean).join(" ");
}

function classify(annotation, datasets, investigations) {
  const kws = keywords(annotationText(annotation));
  const matchedDatasets = datasets
    .map(d  => ({ ...d,  _score: scoreText(datasetText(d),  kws) }))
    .filter(d  => d._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedInvs = investigations
    .map(i  => ({ ...i,  _score: scoreText(invText(i),  kws) }))
    .filter(i  => i._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const hasDs  = matchedDatasets.length > 0;
  const hasInv = matchedInvs.length > 0;
  let cls;
  if (hasDs && hasInv)  cls = "FULLY_EVIDENCED";
  else if (hasDs)        cls = "DATASET_LINKED";
  else if (hasInv)       cls = "INVESTIGATION_LINKED";
  else                   cls = "UNEVIDENCED";
  return { ...annotation, _cls: cls, _datasets: matchedDatasets, _invs: matchedInvs };
}

export default function GraphAnnotationDataEvidenceAtlas() {
  const [open, setOpen]               = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [datasets, setDatasets]       = useState([]);
  const [invs, setInvs]               = useState([]);
  const [classified, setClassified]   = useState([]);
  const [tab, setTab]                 = useState("ALL");
  const [search, setSearch]           = useState("");
  const [expanded, setExpanded]       = useState(null);
  const [brief, setBrief]             = useState("");
  const [assessing, setAssessing]     = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [annRes, dsRes, invRes] = await Promise.allSettled([
        fetch(`${base}/v1/graph/annotations`).then(r => r.json()),
        fetch(`${base}/v1/datasets`).then(r => r.json()),
        fetch(`${base}/v1/investigations`).then(r => r.json()),
      ]);
      const ann = annRes.status === "fulfilled" ? (annRes.value?.items || annRes.value?.annotations || annRes.value || []) : [];
      const ds  = dsRes.status  === "fulfilled" ? (dsRes.value?.items  || dsRes.value?.datasets     || dsRes.value  || []) : [];
      const inv = invRes.status === "fulfilled" ? (invRes.value?.items || invRes.value?.investigations || invRes.value || []) : [];
      setAnnotations(ann);
      setDatasets(ds);
      setInvs(inv);
      setClassified(ann.map(a => classify(a, ds, inv)));
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
    window.addEventListener("jarvis:gadeva-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gadeva-toggle", onToggle);
  }, []);

  const fullyEvidenced    = classified.filter(c => c._cls === "FULLY_EVIDENCED").length;
  const datasetLinked     = classified.filter(c => c._cls === "DATASET_LINKED").length;
  const invLinked         = classified.filter(c => c._cls === "INVESTIGATION_LINKED").length;
  const unevidenced       = classified.filter(c => c._cls === "UNEVIDENCED").length;
  const total             = classified.length;
  const evidencedPct      = total ? Math.round((fullyEvidenced / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || annotationText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `GADEVA: ${total} graph annotations — FULLY_EVIDENCED: ${fullyEvidenced}, DATASET_LINKED: ${datasetLinked}, INVESTIGATION_LINKED: ${invLinked}, UNEVIDENCED: ${unevidenced} (${evidencedPct}% evidenced). Datasets: ${datasets.length}. Investigations: ${invs.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `GADEVA data evidence atlas assessment. Context: ${ctx}. Provide a 2-sentence operational brief identifying which unevidenced annotations represent the highest data-grounding risk and recommend the most urgent dataset or investigation linkages to establish evidence. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Data evidence assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
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
        title="Graph Annotation Data Evidence Atlas (GADEVA)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${AM}55`,
          color: AM, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {unevidenced > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {unevidenced}
          </span>
        )}
        ◈ GADEVA
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
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ GADEVA</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Graph Annotation × Dataset × Investigation Data Evidence Atlas
        </span>
        {loading && <span style={{ color: AM, fontSize: 10 }}>◌ loading…</span>}
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
          ["ANNOTATIONS",          total,          CY],
          ["DATASETS",             datasets.length, PU],
          ["INVESTIGATIONS",       invs.length,     CW],
          ["FULLY EVIDENCED",      fullyEvidenced,  GR],
          ["DATASET LINKED",       datasetLinked,   PU],
          ["INV LINKED",           invLinked,       CW],
          ["UNEVIDENCED",          unevidenced,     AM],
          ["EVIDENCED%",           evidencedPct + "%", GR],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>DATA EVIDENCE COVERAGE</div>
        <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", position: "relative", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${evidencedPct}%`, background: GR, borderRadius: 3, transition: "width 0.4s" }} />
        </div>
        <div style={{ color: GR, fontSize: 9, marginTop: 2 }}>{evidencedPct}% of annotations fully evidenced with dataset + investigation grounding</div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={assess} disabled={assessing} style={{
          fontFamily: FONT, fontSize: 10, letterSpacing: 1, cursor: assessing ? "not-allowed" : "pointer",
          background: assessing ? "rgba(0,207,255,0.1)" : "rgba(0,207,255,0.15)",
          border: `1px solid ${CY}66`, color: CY, padding: "4px 10px", borderRadius: 4,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS EVIDENCE"}
        </button>
      </div>
      {brief && (
        <div style={{ color: "#DCEBF5", fontSize: 12, lineHeight: 1.5, marginBottom: 12,
          padding: "8px 12px", background: "rgba(0,207,255,0.06)", borderRadius: 6,
          border: `1px solid ${CY}22` }}>
          {brief}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: FONT, fontSize: 9, letterSpacing: 1, padding: "3px 8px", borderRadius: 4,
            cursor: "pointer",
            background: tab === t ? (CLASS_COLOR[t] || CY) : "rgba(0,207,255,0.06)",
            border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "rgba(0,207,255,0.18)"}`,
            color: tab === t ? "#000" : (CLASS_COLOR[t] || CY),
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="search annotations…"
        style={{
          fontFamily: FONT, fontSize: 11, width: "100%", maxWidth: 340, marginBottom: 12,
          background: "rgba(0,207,255,0.04)", border: `1px solid ${BORDER}`,
          color: "#DCEBF5", borderRadius: 4, padding: "5px 10px", outline: "none",
        }}
      />

      {/* Annotation list */}
      {visible.length === 0 && !loading && (
        <div style={{ color: "#6E8AA0", fontSize: 11 }}>No annotations match current filter.</div>
      )}
      {visible.map((a, i) => {
        const col   = CLASS_COLOR[a._cls];
        const isExp = expanded === i;
        const name  = a.label || a.text || a.title || a.name || `Annotation ${i + 1}`;
        return (
          <div key={i} style={{
            marginBottom: 6, border: `1px solid ${col}33`, borderRadius: 6,
            background: "rgba(0,207,255,0.02)", overflow: "hidden",
          }}>
            <div
              onClick={() => setExpanded(isExp ? null : i)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
            >
              <span style={{ color: col, fontSize: 9, letterSpacing: 1, border: `1px solid ${col}55`,
                borderRadius: 3, padding: "1px 5px", minWidth: 130, textAlign: "center" }}>
                {a._cls.replace(/_/g, " ")}
              </span>
              <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{name}</span>
              {a.type && (
                <span style={{ color: AM, fontSize: 9, border: `1px solid ${AM}44`, borderRadius: 2, padding: "0 4px" }}>
                  {a.type}
                </span>
              )}
              {a._datasets.length > 0 && (
                <span style={{ color: PU, fontSize: 9 }}>⊕ {a._datasets.length} dataset{a._datasets.length !== 1 ? "s" : ""}</span>
              )}
              {a._invs.length > 0 && (
                <span style={{ color: CW, fontSize: 9 }}>⊕ {a._invs.length} inv{a._invs.length !== 1 ? "s" : ""}</span>
              )}
              <span style={{ color: col, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
            </div>

            {isExp && (
              <div style={{ padding: "0 10px 10px 10px", borderTop: `1px solid ${col}22` }}>
                {a.content && (
                  <div style={{ color: "#6E8AA0", fontSize: 10, marginTop: 6, marginBottom: 8 }}>
                    {String(a.content).slice(0, 200)}
                  </div>
                )}

                {a._datasets.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED DATASETS</div>
                    {a._datasets.map((d, j) => {
                      const maxScore = Math.max(...a._datasets.map(x => x._score), 1);
                      const bar = Math.round((d._score / maxScore) * 100);
                      return (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                              {d.name || d.title || "Dataset"}
                            </span>
                            {d.type && (
                              <span style={{ color: PU, fontSize: 9, border: `1px solid ${PU}44`, borderRadius: 2, padding: "0 4px" }}>
                                {d.type}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${bar}%`, background: PU, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {a._invs.length > 0 && (
                  <div>
                    <div style={{ color: CW, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED INVESTIGATIONS</div>
                    {a._invs.map((inv, k) => {
                      const maxScore = Math.max(...a._invs.map(x => x._score), 1);
                      const bar = Math.round((inv._score / maxScore) * 100);
                      return (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                              {inv.title || inv.name || "Investigation"}
                            </span>
                            {inv.priority && (
                              <span style={{ color: CW, fontSize: 9, border: `1px solid ${CW}44`, borderRadius: 2, padding: "0 4px" }}>
                                {inv.priority}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${bar}%`, background: CW, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {a._datasets.length === 0 && a._invs.length === 0 && (
                  <div style={{ color: AM, fontSize: 10, marginTop: 6 }}>
                    ◌ No dataset or investigation match — annotation completely unevidenced
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function smallBtn(color) {
  return {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10, cursor: "pointer",
    background: "transparent", border: `1px solid ${color}55`,
    color: color, padding: "2px 6px", borderRadius: 3,
  };
}
