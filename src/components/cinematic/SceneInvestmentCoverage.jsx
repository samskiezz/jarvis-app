/**
 * F137 — Scene × Investment Coverage (SCINV)
 *
 * Parallel-fetches all 10 /v1/cinematic/scene/{id} + /entities/Investment.
 * Keyword-correlates each scene's anchor texts (title + description) against
 * investment positions (name/sector/notes/tags/ticker) to surface:
 *   POSITIONED   — at least one investment overlaps this scene's domain
 *   UNPOSITIONED — no investment coverage — portfolio-scene blind spot
 *
 * Stat tiles: scenes / investments / positioned / unpositioned
 * Filter tabs: ALL / POSITIONED / UNPOSITIONED
 * Scene rows expand to show matched investments with sector badge + ticker + relevance score.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence scene-portfolio coverage brief + TTS.
 * 120-s auto-refresh.
 *
 * Toggle: ◈ SCINV at bottom:8, left:708720, zIndex:294
 * Voice:  "scene invest" / "invest scene" / "scinv" / "scene portfolio" /
 *         "portfolio scene" / "which scenes have investments" / "scene investment"
 * Event:  jarvis:scinv-toggle
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const TEAL  = "#2dd4bf";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const BTN_LEFT   = 708720;
const REFRESH_MS = 120 * 1000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const SCENE_IDS = [
  "01_command_atrium",
  "02_neural_bridge",
  "03_threat_matrix",
  "04_quantum_core",
  "05_data_vault",
  "06_field_ops",
  "07_comms_hub",
  "08_analytics_grid",
  "09_strategic_ops",
  "10_deep_intel",
];

const SCINV_RE = /\b(scene[._-]?invest|invest[._-]?scene|scinv|scene[._-]?portfolio|portfolio[._-]?scene|which[._-]?scenes?[._-]?have[._-]?invest|scene[._-]?investment[._-]?coverage|scene[._-]?invest[._-]?coverage)\b/i;

export function isScInvQuery(q) {
  return SCINV_RE.test(q || "");
}

// ── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.items))      return raw.items;
  if (Array.isArray(raw.results))    return raw.results;
  if (Array.isArray(raw.data))       return raw.data;
  if (Array.isArray(raw.investments)) return raw.investments;
  if (typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseScene(raw, id) {
  if (!raw || typeof raw !== "object") return { id, title: id, anchors: [] };
  const anchors = raw.anchors || raw.anchor_points || raw.datapoints || [];
  return {
    id,
    title:       raw.title || raw.name || id,
    description: raw.description || raw.summary || "",
    anchors:     Array.isArray(anchors) ? anchors : [],
  };
}

function normaliseInvestments(raw) {
  return normaliseArray(raw).map((inv, i) => ({
    id:     inv.id   || String(i),
    name:   inv.name || inv.title || inv.symbol || `Investment ${i + 1}`,
    sector: inv.sector || inv.industry || inv.category || inv.asset_class || "",
    ticker: inv.ticker || inv.symbol || inv.code || "",
    notes:  (inv.notes || inv.description || inv.summary || "").toString().slice(0, 300),
    tags:   Array.isArray(inv.tags) ? inv.tags.join(" ") : (inv.tags || ""),
  }));
}

// ── keyword correlation ──────────────────────────────────────────────────────

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

function sceneText(scene) {
  const anchorTexts = scene.anchors.map((a) =>
    [a.title, a.label, a.name, a.description, a.text, a.value].filter(Boolean).join(" ")
  );
  return [scene.title, scene.description, ...anchorTexts].join(" ");
}

function invText(inv) {
  return [inv.name, inv.sector, inv.ticker, inv.notes, inv.tags].join(" ");
}

function scoreMatch(scene, inv) {
  const sk = new Set(keywords(sceneText(scene)));
  const ik = keywords(invText(inv));
  if (!sk.size || !ik.length) return 0;
  const hits = ik.filter((w) => sk.has(w));
  return hits.length;
}

function matchInvestmentsToScene(scene, investments) {
  return investments
    .map((inv) => ({ inv, score: scoreMatch(scene, inv) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

// ── exported script builder ──────────────────────────────────────────────────

export async function buildScInvScript() {
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const API  = apiBase();
  try {
    const [scenesSettled, invR] = await Promise.allSettled([
      Promise.allSettled(SCENE_IDS.map((id) =>
        fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr }).then((r) => r.json())
      )),
      fetch(`${API}/entities/Investment`, { headers: hdr }).then((r) => r.json()),
    ]);

    const rawScenes = scenesSettled.status === "fulfilled" ? scenesSettled.value : [];
    const scenes = SCENE_IDS.map((id, i) => {
      const r = rawScenes[i];
      return normaliseScene(r?.status === "fulfilled" ? r.value : null, id);
    });
    const investments = normaliseInvestments(invR.status === "fulfilled" ? invR.value : []);

    const positioned   = scenes.filter((s) => matchInvestmentsToScene(s, investments).length > 0);
    const unpositioned = scenes.length - positioned.length;

    window.dispatchEvent(new CustomEvent("jarvis:scinv-toggle"));
    return (
      `Scene × Investment Coverage open, sir. ${scenes.length} cinematic scenes cross-matched ` +
      `against ${investments.length} investment position${investments.length !== 1 ? "s" : ""}. ` +
      `${positioned.length} scene${positioned.length !== 1 ? "s are" : " is"} POSITIONED with portfolio backing; ` +
      `${unpositioned} scene${unpositioned !== 1 ? "s have" : " has"} no investment alignment — portfolio-scene blind spot. ` +
      `Expand any scene to inspect matched investments or request an AI scene-portfolio brief, sir.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:scinv-toggle"));
    return "Opening Scene × Investment Coverage, sir.";
  }
}

// ── component ────────────────────────────────────────────────────────────────

export default function SceneInvestmentCoverage() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [scenes,    setScenes]    = useState([]);
  const [investments, setInvestments] = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const API_KEY_USED = API_KEY;

  const load = useCallback(async () => {
    setLoading(true);
    const hdr = { Authorization: `Bearer ${API_KEY_USED}` };
    const API  = apiBase();
    try {
      const [rawScenes, invR] = await Promise.allSettled([
        Promise.allSettled(SCENE_IDS.map((id) =>
          fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr }).then((r) => r.json())
        )),
        fetch(`${API}/entities/Investment`, { headers: hdr }).then((r) => r.json()),
      ]);

      const scenesArr = rawScenes.status === "fulfilled" ? rawScenes.value : [];
      const loadedScenes = SCENE_IDS.map((id, i) => {
        const r = scenesArr[i];
        return normaliseScene(r?.status === "fulfilled" ? r.value : null, id);
      });
      const loadedInv = normaliseInvestments(invR.status === "fulfilled" ? invR.value : []);
      setScenes(loadedScenes);
      setInvestments(loadedInv);
    } catch {
      // leave empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => { setOpen((v) => !v); };
    window.addEventListener("jarvis:scinv-toggle", h);
    return () => window.removeEventListener("jarvis:scinv-toggle", h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async (scene) => {
    setAssessing(scene.id);
    const hdr  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY_USED}` };
    const API  = apiBase();
    const matched = matchInvestmentsToScene(scene, investments);
    const prompt =
      `Scene "${scene.title}" has ${matched.length} matched investments: ` +
      matched.slice(0, 4).map(({ inv }) => inv.name).join(", ") +
      `. Give a 2-sentence scene-portfolio coverage brief.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.text || d.content || "";
      if (text) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: text }));
    } catch {/* ignore */}
    setAssessing(null);
  }, [investments]);

  // correlate
  const enriched = scenes.map((s) => ({
    ...s,
    matched: matchInvestmentsToScene(s, investments),
  }));

  const positioned   = enriched.filter((s) => s.matched.length > 0).length;
  const unpositioned = enriched.length - positioned;

  const visible = enriched.filter((s) => {
    const matchTab =
      tab === "ALL"          ? true :
      tab === "POSITIONED"   ? s.matched.length > 0 :
      /* UNPOSITIONED */        s.matched.length === 0;
    const matchSearch = !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const tiles = [
    { label: "SCENES",       val: scenes.length,     color: "#a0b8cc" },
    { label: "INVESTMENTS",  val: investments.length, color: "#a0b8cc" },
    { label: "POSITIONED",   val: positioned,         color: TEAL },
    { label: "UNPOSITIONED", val: unpositioned,       color: AMBER },
  ];

  const accent = AMBER;

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 294,
          background: open ? `${TEAL}22` : "rgba(10,20,30,0.85)",
          color: open ? TEAL : "#4a6070",
          border: `1px solid ${open ? TEAL : "#1e3040"}`,
          borderRadius: 3, padding: "3px 8px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {open ? "◈" : "◉"} SCINV
        {!open && unpositioned > 0 && scenes.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 2, padding: "0px 4px", fontSize: 7,
          }}>{unpositioned}</span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 294,
          width: 380, maxHeight: "calc(100vh - 80px)",
          background: "rgba(6,14,22,0.97)",
          border: `1px solid ${TEAL}33`,
          borderRadius: 6, overflow: "hidden",
          display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* header */}
          <div style={{
            padding: "8px 12px", borderBottom: `1px solid ${TEAL}22`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ color: TEAL, fontSize: 10, letterSpacing: 2 }}>
              ◈ SCENE × INVESTMENT COVERAGE
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {loading && (
                <span style={{ color: "#334455", fontSize: 8 }}>↻</span>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none", color: "#334455",
                  cursor: "pointer", fontSize: 14, lineHeight: 1,
                }}
              >×</button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ padding: "8px 12px", display: "flex", gap: 6, borderBottom: `1px solid #0d1e2a` }}>
            {tiles.map((t) => (
              <div key={t.label} style={{
                flex: 1, background: "rgba(255,255,255,0.02)",
                border: "1px solid #1e3040", borderRadius: 4,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color: t.color, fontSize: 13, fontWeight: "bold" }}>{t.val}</div>
                <div style={{ color: "#445566", fontSize: 7, letterSpacing: 1, marginTop: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid #0d1e2a`, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["ALL", "POSITIONED", "UNPOSITIONED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${TEAL}22` : "none",
                  color: tab === t ? TEAL : "#334455",
                  border: `1px solid ${tab === t ? `${TEAL}55` : "#1e3040"}`,
                  borderRadius: 3, padding: "2px 8px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                  letterSpacing: 1, cursor: "pointer",
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search scenes…"
              style={{
                flex: 1, minWidth: 80,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid #1e3040",
                borderRadius: 3, padding: "2px 6px",
                color: "#a0b8cc", fontSize: 8,
                fontFamily: "'JetBrains Mono',monospace",
              }}
            />
          </div>

          {/* scene rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 12px" }}>
            {loading && scenes.length === 0 && (
              <div style={{ color: "#334455", fontSize: 9, padding: "12px 0", textAlign: "center" }}>
                ↻ loading scenes + investments…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: "#334455", fontSize: 9, padding: "12px 0", textAlign: "center" }}>
                no scenes match filter
              </div>
            )}
            {visible.map((scene) => {
              const isExpanded  = expanded === scene.id;
              const hasMatches  = scene.matched.length > 0;
              const statusColor = hasMatches ? TEAL : AMBER;
              const statusLabel = hasMatches ? "POSITIONED" : "UNPOSITIONED";

              return (
                <div key={scene.id} style={{
                  background: "rgba(255,255,255,0.015)",
                  border: `1px solid ${hasMatches ? `${TEAL}22` : "#1e3040"}`,
                  borderRadius: 4, padding: "7px 9px", marginBottom: 5,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ color: "#c0d8e8", fontSize: 10, flex: 1 }}>
                      {scene.title}
                    </div>
                    <span style={{
                      fontSize: 7, color: statusColor,
                      border: `1px solid ${statusColor}44`,
                      borderRadius: 2, padding: "1px 5px", marginLeft: 6, whiteSpace: "nowrap",
                    }}>{statusLabel}</span>
                  </div>

                  <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 8, color: "#445566" }}>
                      {scene.matched.length} investment{scene.matched.length !== 1 ? "s" : ""} matched
                    </span>
                    <span style={{ fontSize: 8, color: "#2a3a4a" }}>·</span>
                    <span style={{ fontSize: 8, color: "#445566" }}>
                      {scene.anchors.length} anchor{scene.anchors.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* action row */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {hasMatches && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : scene.id)}
                        style={{
                          background: `${TEAL}12`, color: TEAL,
                          border: `1px solid ${TEAL}33`, borderRadius: 3,
                          padding: "3px 10px",
                          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                          letterSpacing: 1, cursor: "pointer",
                        }}
                      >
                        {isExpanded ? "▾ HIDE" : "▸ INVESTMENTS"}
                      </button>
                    )}
                    <button
                      onClick={() => assess(scene)}
                      disabled={assessing === scene.id}
                      style={{
                        background: assessing === scene.id ? "#1a2530" : `${accent}18`,
                        color: assessing === scene.id ? "#445566" : accent,
                        border: `1px solid ${accent}44`, borderRadius: 3,
                        padding: "3px 10px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                        letterSpacing: 1, cursor: assessing === scene.id ? "default" : "pointer",
                      }}
                    >
                      {assessing === scene.id ? "…assessing" : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* expanded investments */}
                  {isExpanded && hasMatches && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${TEAL}15` }}>
                      {scene.matched.map(({ inv, score }) => (
                        <div key={inv.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                        }}>
                          <div style={{ color: "#a0b8cc", fontSize: 10, marginBottom: 2 }}>{inv.name}</div>
                          <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
                            {inv.sector && (
                              <span style={{
                                fontSize: 7, color: "#60a5fa",
                                border: "1px solid #60a5fa33",
                                borderRadius: 2, padding: "1px 5px",
                              }}>{inv.sector}</span>
                            )}
                            {inv.ticker && (
                              <span style={{
                                fontSize: 7, color: "#34d399",
                                border: "1px solid #34d39933",
                                borderRadius: 2, padding: "1px 5px",
                              }}>{inv.ticker}</span>
                            )}
                            <div style={{ flex: 1, height: 3, background: "#1e2a35", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{
                                width: `${Math.min(100, score * 20)}%`,
                                height: "100%", background: GREEN, borderRadius: 2,
                              }} />
                            </div>
                            <span style={{ fontSize: 7, color: "#334455" }}>score {score}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div style={{
            padding: "5px 12px", borderTop: `1px solid #0d1e2a`,
            color: "#2a3a4a", fontSize: 7, letterSpacing: 1,
          }}>
            {visible.length} of {enriched.length} scenes · {investments.length} investments indexed · auto-refresh 120s
          </div>
        </div>
      )}
    </>
  );
}
