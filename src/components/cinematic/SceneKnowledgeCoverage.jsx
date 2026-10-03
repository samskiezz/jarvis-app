/**
 * SceneKnowledgeCoverage — F63
 * /v1/cinematic/scene/{id} (all 10 scenes) × /knowledge/ → keyword-correlates
 * each scene's anchor data against KB articles to classify DOCUMENTED (≥2) /
 * PARTIAL (1) / DARK (0).
 * Voice: "scene knowledge"/"sckn"/"scene articles"/"cinematic coverage"/
 *        "which scenes have knowledge"/"scene kb"/"scene knowledge coverage".
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GRN = "#4ADE80";
const AMB = "#FFBB33";
const RED = "#FF4455";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SCENE_IDS = [
  "01_command_atrium",
  "02_neural_core",
  "03_threat_matrix",
  "04_global_ops",
  "05_data_vault",
  "06_comms_nexus",
  "07_field_command",
  "08_intel_forge",
  "09_mission_control",
  "10_strategic_hub",
];

const SCKN_RE =
  /\bscene\s*knowledge\b|\bsckn\b|\bscene\s*articles?\b|\bcinematic\s*coverage\b|\bwhich\s*scenes?\s*(?:have\s*)?knowledge\b|\bscene\s*kb\b|\bscene\s*knowledge\s*coverage\b|\bscene\s*docs?\b|\bcinematic\s*knowledge\b/i;

export function isScknQuery(text) {
  return SCKN_RE.test(text || "");
}

async function fetchScene(id) {
  const r = await fetch(`${apiBase()}/v1/cinematic/scene/${id}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return { id, data: d };
}

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)           ? d
    : Array.isArray(d?.items)       ? d.items
    : Array.isArray(d?.data)        ? d.data
    : Array.isArray(d?.results)     ? d.results
    : Array.isArray(d?.articles)    ? d.articles
    : [];
}

function sceneKeywords(sceneData) {
  const anchors = sceneData?.anchors || sceneData?.data?.anchors || [];
  const title   = sceneData?.title   || sceneData?.data?.title   || "";
  const desc    = sceneData?.description || sceneData?.data?.description || "";
  const parts   = [title, desc];
  for (const a of anchors) {
    parts.push(a?.label, a?.value, a?.description, a?.key, a?.name);
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function articleKeywords(article) {
  return [
    article?.title, article?.name, article?.summary, article?.body,
    article?.category, article?.tags?.join?.(" "), article?.content,
    article?.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function classify(kw, articles) {
  const tokens = kw.split(/\W+/).filter((t) => t.length > 3);
  const matched = articles.filter((art) => {
    const artKw = articleKeywords(art);
    const artTokens = artKw.split(/\W+/).filter((t) => t.length > 3);
    return tokens.some((t) => artKw.includes(t)) || artTokens.some((t) => kw.includes(t));
  });
  const status =
    matched.length >= 2 ? "DOCUMENTED"
    : matched.length === 1 ? "PARTIAL"
    : "DARK";
  return { matched, status };
}

function humanId(id) {
  return id.replace(/^\d+_/, "").replace(/_/g, " ").toUpperCase();
}

export async function buildScknScript() {
  const [scenes, articles] = await Promise.all([
    Promise.all(SCENE_IDS.map(fetchScene)),
    fetchKnowledge(),
  ]);
  const rows = scenes.map(({ id, data }) => {
    const kw = sceneKeywords(data);
    const { matched, status } = classify(kw, articles);
    return { id, data, matched, status };
  });
  const documented = rows.filter((r) => r.status === "DOCUMENTED");
  const partial    = rows.filter((r) => r.status === "PARTIAL");
  const dark       = rows.filter((r) => r.status === "DARK");
  if (!rows.length) return "Scene knowledge coverage data is unavailable, sir.";
  const darkNames = dark.slice(0, 3).map((r) => humanId(r.id)).join(", ");
  return (
    `Cinematic Scene Knowledge Coverage: ${rows.length} scenes assessed against ` +
    `${articles.length} knowledge articles. ` +
    `${documented.length} DOCUMENTED, ${partial.length} PARTIAL, ${dark.length} DARK. ` +
    (dark.length
      ? `Scenes with no knowledge backing: ${darkNames}.`
      : "All scenes have at least one matching knowledge article, sir.")
  );
}

export default function SceneKnowledgeCoverage() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [loading, setLoading]     = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [scenes, articles] = await Promise.all([
        Promise.all(SCENE_IDS.map(fetchScene)),
        fetchKnowledge(),
      ]);
      const built = scenes.map(({ id, data }) => {
        const kw = sceneKeywords(data);
        const { matched, status } = classify(kw, articles);
        return { id, data, matched, status };
      });
      setRows(built);
    } catch {
      // stale data stays
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((v) => { if (!v) refresh(); return !v; });
    window.addEventListener("jarvis:sckn-toggle", toggle);
    return () => window.removeEventListener("jarvis:sckn-toggle", toggle);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(refresh, 90_000);
    return () => clearInterval(id);
  }, [open, refresh]);

  const documented = rows.filter((r) => r.status === "DOCUMENTED");
  const partial    = rows.filter((r) => r.status === "PARTIAL");
  const dark       = rows.filter((r) => r.status === "DARK");

  const visible = rows.filter((r) => {
    if (filter === "DOCUMENTED" && r.status !== "DOCUMENTED") return false;
    if (filter === "PARTIAL"    && r.status !== "PARTIAL")    return false;
    if (filter === "DARK"       && r.status !== "DARK")       return false;
    if (search) {
      const label = humanId(r.id).toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess(row) {
    setAssessing(row.id);
    const sceneName    = humanId(row.id);
    const articleNames = row.matched.map((a) => a.title || a.name || "Unknown").join(", ") || "none";
    const prompt =
      `Cinematic scene "${sceneName}" is ${row.status}. ` +
      (row.matched.length
        ? `Matching KB articles: ${articleNames}.`
        : "No knowledge articles currently cover this scene.") +
      " Provide a 2-sentence scene knowledge gap brief and recommended action.";
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const brief = d?.response || d?.message || d?.content || "Assessment complete.";
      const voice = getActiveVoice?.() ?? "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: brief, voice }),
      });
    } catch {
      // ignore TTS errors
    }
    setAssessing(null);
  }

  if (!open) {
    const darkCount = dark.length;
    return (
      <button
        onClick={() => { setOpen(true); refresh(); }}
        title="Scene × Knowledge Article Coverage (F63)"
        style={{
          position: "fixed", left: 16280, bottom: 8, zIndex: 71,
          background: "rgba(5,8,13,0.72)", border: `1px solid ${darkCount > 0 ? AMB : CY}55`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 11, color: darkCount > 0 ? AMB : CY,
          letterSpacing: 1, backdropFilter: "blur(6px)",
        }}
      >
        ◈ SCKN{darkCount > 0 && <sup style={{ color: AMB, marginLeft: 2 }}>{darkCount}</sup>}
      </button>
    );
  }

  const statusColor = (s) =>
    s === "DOCUMENTED" ? GRN : s === "PARTIAL" ? AMB : RED;

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(2,5,10,0.88)", zIndex: 9100, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      <div style={{
        width: "min(820px,94vw)", maxHeight: "88vh", overflowY: "auto",
        background: "rgba(8,14,22,0.96)", border: `1px solid ${CY}44`,
        borderRadius: 14, padding: "20px 22px",
        boxShadow: `0 0 60px ${CY}18`,
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ color: CY, fontSize: 13, letterSpacing: 3, textShadow: `0 0 12px ${CY}` }}>
            ◈ CINEMATIC SCENE × KNOWLEDGE ARTICLE COVERAGE
          </span>
          {loading && <span style={{ color: CY, fontSize: 10, marginLeft: "auto" }}>refreshing…</span>}
          <button onClick={() => setOpen(false)}
            style={{ marginLeft: loading ? 0 : "auto", background: "none", border: "none",
              cursor: "pointer", color: "#6E8AA0", fontSize: 16 }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            { label: "SCENES",     val: rows.length,        col: CY  },
            { label: "DOCUMENTED", val: documented.length,  col: GRN },
            { label: "PARTIAL",    val: partial.length,     col: AMB },
            { label: "DARK",       val: dark.length,        col: RED },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              flex: "1 1 120px", background: "rgba(41,231,255,0.05)",
              border: `1px solid ${col}33`, borderRadius: 8, padding: "8px 12px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "#6E8AA0", fontSize: 10, letterSpacing: 1, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* filter + search */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {["ALL", "DOCUMENTED", "PARTIAL", "DARK"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                background: filter === f ? `${CY}22` : "none",
                border: `1px solid ${filter === f ? CY : "#6E8AA0"}55`,
                borderRadius: 5, padding: "3px 10px", cursor: "pointer",
                color: filter === f ? CY : "#6E8AA0", fontSize: 11,
              }}>{f}</button>
          ))}
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="search scenes…"
            style={{
              marginLeft: "auto", background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`, borderRadius: 5,
              padding: "3px 10px", color: CY, fontSize: 11,
              outline: "none", width: 160,
            }}
          />
        </div>

        {/* rows */}
        {visible.length === 0 && (
          <div style={{ color: "#6E8AA0", fontSize: 12, textAlign: "center", padding: 20 }}>
            {loading ? "Loading…" : "No scenes match current filter."}
          </div>
        )}
        {visible.map((row, i) => {
          const label = humanId(row.id);
          const isExp = expanded === i;
          const col   = statusColor(row.status);
          const busy  = assessing === row.id;
          return (
            <div key={row.id} style={{
              border: `1px solid ${col}33`, borderRadius: 8, marginBottom: 8,
              background: "rgba(8,14,22,0.6)",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer" }}
              >
                <span style={{ color: col, fontSize: 10, letterSpacing: 1, minWidth: 100 }}>{row.status}</span>
                <span style={{ color: "#DCEBF5", fontSize: 12, flex: 1 }}>{label}</span>
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>
                  {row.matched.length} article{row.matched.length !== 1 ? "s" : ""}
                </span>
                <span style={{ color: CY, fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 12px 12px" }}>
                  {row.matched.length === 0 ? (
                    <div style={{ color: RED, fontSize: 11, marginBottom: 8 }}>
                      No matching knowledge articles — this scene is DARK.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {row.matched.map((art, j) => (
                        <div key={j} style={{
                          background: "rgba(74,222,128,0.07)", border: `1px solid ${GRN}33`,
                          borderRadius: 6, padding: "5px 10px", fontSize: 11,
                        }}>
                          <div style={{ color: GRN }}>{art.title || art.name || "Article"}</div>
                          {art.category && (
                            <div style={{ color: "#6E8AA0", fontSize: 10, marginTop: 1 }}>{art.category}</div>
                          )}
                          {(art.summary || art.description) && (
                            <div style={{ color: "#6E8AA0", marginTop: 2, maxWidth: 260 }}>
                              {(art.summary || art.description).slice(0, 80)}
                              {(art.summary || art.description).length > 80 ? "…" : ""}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => assess(row)}
                    disabled={busy}
                    style={{
                      background: busy ? "rgba(41,231,255,0.05)" : `${CY}18`,
                      border: `1px solid ${CY}44`, borderRadius: 5,
                      padding: "4px 12px", cursor: busy ? "wait" : "pointer",
                      color: CY, fontSize: 11,
                    }}
                  >
                    {busy ? "assessing…" : "▶ ASSESS"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
