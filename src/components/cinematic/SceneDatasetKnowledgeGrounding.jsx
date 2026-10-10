/**
 * SceneDatasetKnowledgeGrounding — F102 (SDKGRND).
 *
 * Pulls all 10 /v1/cinematic/scene/{id} × /v1/datasets × /knowledge/ and
 * keyword-correlates each scene against datasets AND KB articles, classifying
 * each scene as:
 *
 *   FULLY_GROUNDED — matched at least one dataset AND one KB article
 *   DATA_ONLY      — matched a dataset but no KB article
 *   KB_ONLY        — matched a KB article but no dataset
 *   UNGROUNDED     — no dataset or KB article backing (intelligence blind spot)
 *
 * Red pulse on UNGROUNDED count.
 *
 * Layout:
 *   • 5 stat tiles: SCENES / DATASETS / KB ARTS / FULLY GROUNDED / UNGROUNDED
 *   • Coverage % bar
 *   • Filter tabs: ALL / FULLY_GROUNDED / DATA_ONLY / KB_ONLY / UNGROUNDED
 *   • Text search on scene id / title / label
 *   • Expandable rows → matched datasets (cyan) + KB articles (amber)
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ SDKGRND at left:980260, bottom:8, zIndex:126
 * Mounted: App.jsx
 * Wired:   JarvisBrain.jsx via isSdkgrndQuery / buildSdkgrndScript
 *
 * Voice: "sdkgrnd" / "scene dataset" / "scene knowledge" /
 *        "grounded scene" / "scene grounding" / "scene data" /
 *        "scene kb" / "ungrounded scene" / "scene intelligence grounding"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { CINEMATIC_SCENES } from "@/lib/cinematicSceneRegistry";

const CY    = "#29E7FF";
const AMBER = "#FFB347";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const DIM   = "#1a2a38";

const BTN_LEFT   = 980260;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function keywords(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function matchPool(entity, pool) {
  const eks = keywords(
    [entity.label, entity.title, entity.id, entity.description, entity.name].join(" ")
  );
  if (!eks.length) return [];
  return pool.filter(item => {
    const pks = keywords(
      [item.title, item.subject, item.name, item.description, item.content, item.type].join(" ")
    );
    return eks.some(k => pks.includes(k));
  });
}

function classify(dataHits, kbHits) {
  if (dataHits > 0 && kbHits > 0) return "FULLY_GROUNDED";
  if (dataHits > 0)                return "DATA_ONLY";
  if (kbHits > 0)                  return "KB_ONLY";
  return "UNGROUNDED";
}

const CLASS_ORDER = ["FULLY_GROUNDED", "DATA_ONLY", "KB_ONLY", "UNGROUNDED"];
const CLASS_LABEL = {
  FULLY_GROUNDED: "FULLY GROUNDED",
  DATA_ONLY:      "DATA ONLY",
  KB_ONLY:        "KB ONLY",
  UNGROUNDED:     "UNGROUNDED",
};
const CLASS_COLOR = {
  FULLY_GROUNDED: GREEN,
  DATA_ONLY:      CY,
  KB_ONLY:        AMBER,
  UNGROUNDED:     RED,
};

async function fetchData() {
  const base = apiBase();
  const hdr  = authHdr();
  const [sceneResults, rawDS, rawKB] = await Promise.all([
    Promise.all(
      CINEMATIC_SCENES.map(s =>
        fetch(`${base}/v1/cinematic/scene/${s.id}`, { headers: hdr })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    ),
    fetch(`${base}/v1/datasets`,  { headers: hdr }).then(r => r.json()),
    fetch(`${base}/knowledge/`,   { headers: hdr }).then(r => r.json()),
  ]);
  const datasets = normalise(rawDS);
  const kb       = normalise(rawKB);

  const rows = CINEMATIC_SCENES.map((s, i) => {
    const sceneData    = sceneResults[i];
    const sceneLabel   = s.label || s.title || s.id || `Scene ${i + 1}`;
    const dataMatches  = matchPool({ ...s, label: sceneLabel, description: sceneData?.description || "" }, datasets);
    const kbMatches    = matchPool({ ...s, label: sceneLabel, description: sceneData?.description || "" }, kb);
    const cls          = classify(dataMatches.length, kbMatches.length);
    return {
      id:           s.id,
      label:        sceneLabel,
      anchors:      Array.isArray(sceneData?.anchors) ? sceneData.anchors.length : 0,
      cls,
      dataMatches,
      kbMatches,
    };
  });

  return { rows, datasets, kb };
}

const SDKGRND_RE = /\bsdkgrnd\b|\bscene\s*(dataset|knowledge|grounding|data\s*knowledge|intel\s*grounding|kb|intelligence\s*grounding)\b|\bgrounded\s*scene\b|\bungrounded\s*scene\b|\bscene\s*backing\b|\bscene\s*data\b|\bscene\s*kb\b/i;

export function isSdkgrndQuery(q = "") { return SDKGRND_RE.test(q); }

export async function buildSdkgrndScript() {
  try {
    const { rows } = await fetchData();
    const fully  = rows.filter(r => r.cls === "FULLY_GROUNDED").length;
    const ungrd  = rows.filter(r => r.cls === "UNGROUNDED").length;
    const pct    = Math.round((fully / rows.length) * 100);
    const worst  = rows.filter(r => r.cls === "UNGROUNDED").map(r => r.label).slice(0, 3).join(", ") || "none";
    return `Scene Dataset–Knowledge Grounding: ${fully}/${rows.length} scenes (${pct}%) are fully grounded with both dataset and KB article backing. ${ungrd} scene(s) are ungrounded — no data or KB support detected; top ungrounded: ${worst}. Recommend acquiring datasets and KB articles to cover these intelligence blind spots.`;
  } catch {
    return "Unable to retrieve scene grounding data at this time.";
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SceneDatasetKnowledgeGrounding() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState([]);
  const [datasets,setDatasets]= useState([]);
  const [kb,      setKb]      = useState([]);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [filter,  setFilter]  = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [expanded,setExpanded]= useState(null);
  const [assessing,setAssessing]=useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchData();
      setRows(d.rows);
      setDatasets(d.datasets);
      setKb(d.kb);
    } catch (e) {
      setErr(e.message || "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => {
      if (!o) load();
      return !o;
    });
    window.addEventListener("jarvis:sdkgrnd-toggle", handler);
    return () => window.removeEventListener("jarvis:sdkgrnd-toggle", handler);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildSdkgrndScript();
      const base   = apiBase();
      const r      = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: script }),
      });
      const d      = await r.json();
      const answer = (d.answer || script).trim();
      await fetch(`${base}/v1/voice/tts`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ text: answer }),
      });
    } catch { /* silent */ }
    setAssessing(false);
  }, []);

  const fully  = rows.filter(r => r.cls === "FULLY_GROUNDED").length;
  const ungrd  = rows.filter(r => r.cls === "UNGROUNDED").length;
  const pct    = rows.length ? Math.round((fully / rows.length) * 100) : 0;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.id.toLowerCase().includes(q) || r.label.toLowerCase().includes(q);
    }
    return true;
  });

  const PULSE = {
    animation: "pulse-red 1.2s infinite",
  };

  return (
    <>
      <style>{`
        @keyframes pulse-red {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,61,90,0.6); }
          50%      { box-shadow: 0 0 0 6px rgba(255,61,90,0); }
        }
        @keyframes pulse-sdkgrnd {
          0%,100% { opacity:1; }
          50%      { opacity:0.55; }
        }
      `}</style>

      {/* Floating toggle button */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        title="Scene Dataset–Knowledge Grounding (SDKGRND)"
        style={{
          position: "fixed",
          left:     BTN_LEFT,
          bottom:   8,
          zIndex:   126,
          background: open ? CY : "#0d1f2d",
          color:      open ? "#000" : CY,
          border:     `1px solid ${CY}`,
          borderRadius: 4,
          padding:    "3px 8px",
          fontSize:   10,
          fontFamily: "monospace",
          cursor:     "pointer",
          letterSpacing: 1,
          ...(ungrd > 0 && !open ? PULSE : {}),
        }}
      >
        ◈ SDKGRND
      </button>

      {open && (
        <div style={{
          position:   "fixed",
          top:        60,
          left:       "50%",
          transform:  "translateX(-50%)",
          width:      780,
          maxHeight:  "80vh",
          overflowY:  "auto",
          background: "#0a1520",
          border:     `1px solid ${CY}`,
          borderRadius: 8,
          zIndex:     9900,
          padding:    16,
          fontFamily: "monospace",
          color:      "#c8d8e8",
        }}>
          {/* Header */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ color:CY, fontSize:13, letterSpacing:2 }}>
              ◈ SCENE DATASET–KNOWLEDGE GROUNDING
            </span>
            <div style={{ display:"flex", gap:8 }}>
              <button
                onClick={handleAssess}
                disabled={assessing}
                style={{ background:GREEN, color:"#000", border:"none", borderRadius:4, padding:"3px 10px", fontSize:10, cursor:"pointer" }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background:"transparent", color:"#888", border:"1px solid #333", borderRadius:4, padding:"2px 8px", fontSize:11, cursor:"pointer" }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          {rows.length > 0 && (
            <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
              {[
                { label:"SCENES",         val: rows.length,       col: CY    },
                { label:"DATASETS",       val: datasets.length,   col: CY    },
                { label:"KB ARTS",        val: kb.length,         col: AMBER },
                { label:"FULLY GROUNDED", val: fully,             col: GREEN },
                { label:"UNGROUNDED",     val: ungrd,             col: RED   },
              ].map(t => (
                <div key={t.label} style={{ background:DIM, border:`1px solid ${t.col}33`, borderRadius:4, padding:"6px 12px", minWidth:80, textAlign:"center" }}>
                  <div style={{ color:t.col, fontSize:14, fontWeight:"bold" }}>{t.val}</div>
                  <div style={{ color:"#7a9ab8", fontSize:9 }}>{t.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Coverage bar */}
          {rows.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, color:"#7a9ab8", marginBottom:4 }}>Coverage {pct}%</div>
              <div style={{ height:6, background:"#1a2a38", borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background: pct >= 50 ? GREEN : AMBER, transition:"width .4s" }} />
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
            {["ALL", ...CLASS_ORDER].map(tab => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                style={{
                  background:   filter === tab ? CY : DIM,
                  color:        filter === tab ? "#000" : "#7a9ab8",
                  border:       `1px solid ${filter === tab ? CY : "#2a3a4a"}`,
                  borderRadius: 3,
                  padding:      "2px 8px",
                  fontSize:     9,
                  cursor:       "pointer",
                }}
              >
                {tab === "ALL" ? "ALL" : CLASS_LABEL[tab]}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            placeholder="Search scenes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width:"100%", background:"#0d1f2d", border:`1px solid #2a3a4a`, color:"#c8d8e8", borderRadius:4, padding:"4px 8px", fontSize:11, marginBottom:10, boxSizing:"border-box" }}
          />

          {/* Loading / error */}
          {loading && <div style={{ color:"#7a9ab8", fontSize:11, textAlign:"center", padding:12 }}>Loading…</div>}
          {err     && <div style={{ color:RED, fontSize:11, padding:8 }}>Error: {err}</div>}

          {/* Rows */}
          {!loading && visible.map(row => {
            const isExp = expanded === row.id;
            const cls   = row.cls;
            const col   = CLASS_COLOR[cls];
            return (
              <div key={row.id} style={{ borderBottom:"1px solid #1a2a38" }}>
                <div
                  onClick={() => setExpanded(isExp ? null : row.id)}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 4px", cursor:"pointer" }}
                >
                  <div>
                    <span style={{ color:CY, fontSize:11, marginRight:8 }}>{row.id}</span>
                    <span style={{ color:"#c8d8e8", fontSize:11 }}>{row.label}</span>
                    {row.anchors > 0 && (
                      <span style={{ color:"#7a9ab8", fontSize:10, marginLeft:8 }}>{row.anchors} anchors</span>
                    )}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{
                      background: col + "22",
                      color:       col,
                      border:      `1px solid ${col}55`,
                      borderRadius: 3,
                      padding:     "1px 7px",
                      fontSize:    9,
                      letterSpacing: 0.5,
                      ...(cls === "UNGROUNDED" ? { animation: "pulse-sdkgrnd 1.4s infinite" } : {}),
                    }}>
                      {CLASS_LABEL[cls]}
                    </span>
                    <span style={{ color:"#7a9ab8", fontSize:10 }}>
                      DS:{row.dataMatches.length} KB:{row.kbMatches.length}
                    </span>
                    <span style={{ color:"#555", fontSize:10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExp && (
                  <div style={{ padding:"4px 12px 10px", background:"#0d1a26" }}>
                    {row.dataMatches.length > 0 && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ color:CY, fontSize:9, marginBottom:4 }}>DATASETS ({row.dataMatches.length})</div>
                        {row.dataMatches.slice(0, 5).map((d, i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                            <div style={{ fontSize:10, color:"#c8d8e8", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {d.name || d.title || d.id || "—"}
                            </div>
                            <div style={{ width:80, height:4, background:"#1a2a38", borderRadius:2, flexShrink:0 }}>
                              <div style={{ height:"100%", width:`${Math.min(100, 60 + i * 8)}%`, background:CY, borderRadius:2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {row.kbMatches.length > 0 && (
                      <div>
                        <div style={{ color:AMBER, fontSize:9, marginBottom:4 }}>KB ARTICLES ({row.kbMatches.length})</div>
                        {row.kbMatches.slice(0, 5).map((k, i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                            <div style={{ fontSize:10, color:"#c8d8e8", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {k.title || k.subject || k.name || "—"}
                            </div>
                            <div style={{ width:80, height:4, background:"#1a2a38", borderRadius:2, flexShrink:0 }}>
                              <div style={{ height:"100%", width:`${Math.min(100, 60 + i * 8)}%`, background:AMBER, borderRadius:2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {row.dataMatches.length === 0 && row.kbMatches.length === 0 && (
                      <div style={{ color:"#555", fontSize:10 }}>No matching datasets or KB articles found for this scene.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!loading && visible.length === 0 && rows.length > 0 && (
            <div style={{ color:"#555", fontSize:11, textAlign:"center", padding:12 }}>No scenes match filter.</div>
          )}

          <div style={{ color:"#3a4a5a", fontSize:9, marginTop:10, textAlign:"right" }}>
            auto-refresh every {REFRESH_MS / 1000}s · /v1/cinematic/scene/* × /v1/datasets × /knowledge/
          </div>
        </div>
      )}
    </>
  );
}
