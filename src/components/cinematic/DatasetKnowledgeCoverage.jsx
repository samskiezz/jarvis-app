/**
 * DatasetKnowledgeCoverage — F107.
 *
 * Parallel-fetches /v1/datasets + /knowledge/.
 * Keyword-correlates each dataset (name/description/type/tags) against
 * knowledge article titles and content to surface:
 *   DOCUMENTED — dataset with ≥1 matching knowledge article
 *   DARK       — dataset with no documentation found (knowledge gap)
 *
 * Stat tiles: datasets / articles / documented / dark
 * Filter tabs: ALL / DOCUMENTED / DARK + text search
 * Expand dataset → matched articles with relevance score + type badge.
 * Amber badge on dark-dataset count.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence data-documentation
 *   brief + TTS via jarvis:speak-dossier.
 * 120-s auto-refresh.
 *
 * Intent: "dataset knowledge" / "dataset docs" / "which datasets have docs" /
 *         "undocumented datasets" / "data documentation gap" / "dsknow"
 *   → jarvis:dsknow-toggle + TTS brief via buildDsknowScript()
 *
 * Toggle: ◈ DSKNOW at left:30120, bottom:8, zIndex:60.
 * Registered in panelRegistry.generated.js under "Data & Datasets".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const GR    = "#4ADE80";

const BTN_LEFT   = 30120;
const REFRESH_MS = 120_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisers ─────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))               return raw;
  if (raw && Array.isArray(raw.items))  return raw.items;
  if (raw && Array.isArray(raw.data))   return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")   return Object.values(raw);
  return [];
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((d) => ({
    id:          d.id || d.dataset_id || String(Math.random()),
    name:        d.name || d.title || d.dataset_name || "Untitled Dataset",
    description: d.description || d.summary || d.abstract || "",
    type:        d.type || d.category || d.dataset_type || "",
    tags:        [...(d.tags || []), ...(d.keywords || [])].map(String),
    row_count:   d.row_count ?? d.rows ?? d.record_count ?? null,
  }));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)                 ? raw
    : Array.isArray(raw?.data)                   ? raw.data
    : Array.isArray(raw?.items)                  ? raw.items
    : Array.isArray(raw?.results)                ? raw.results
    : Array.isArray(raw?.knowledge)              ? raw.knowledge
    : Array.isArray(raw?.articles)               ? raw.articles
    : Array.isArray(raw?.chunks)                 ? raw.chunks
    : [];
  return arr.map((a) => ({
    id:      a.id || a.chunk_id || String(Math.random()),
    title:   a.title || a.name || a.topic || a.subject || "Untitled",
    content: a.content || a.text || a.body || a.summary || "",
    type:    a.type || a.category || "",
    tags:    [...(a.tags || []), ...(a.keywords || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(dataset, article) {
  const dsText = `${dataset.name} ${dataset.description} ${dataset.type} ${dataset.tags.join(" ")}`.toLowerCase();
  const artWords = [
    ...tokens(article.title),
    ...tokens(article.content.slice(0, 400)),
    ...article.tags.flatMap(tokens),
  ];
  return artWords.reduce((acc, w) => acc + (dsText.includes(w) ? 1 : 0), 0);
}

function correlate(datasets, articles) {
  return datasets.map((ds) => {
    const matched = articles
      .map((a) => ({ ...a, _score: matchScore(ds, a) }))
      .filter((a) => a._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...ds, matched };
  }).sort((a, b) => a.matched.length - b.matched.length); // dark first
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const DSKNOW_RE =
  /dataset.{0,15}knowledge|dataset.{0,12}docs?|undocumented.{0,10}dataset|which.{0,15}dataset.{0,10}(have|has).{0,8}doc|data.{0,12}documentation.{0,10}gap|dsknow\b/i;

export function isDsknowQuery(q) {
  return DSKNOW_RE.test(q || "");
}

export async function buildDsknowScript() {
  try {
    const [dsRaw, artRaw] = await Promise.all([
      fetch(`${apiBase()}/v1/datasets`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/knowledge/`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const datasets  = normaliseDatasets(dsRaw);
    const articles  = normaliseArticles(artRaw);
    const corr      = correlate(datasets, articles);
    const dark      = corr.filter((d) => d.matched.length === 0);
    const documented = corr.filter((d) => d.matched.length > 0);
    return `Dataset knowledge coverage analysis complete, sir. ${datasets.length} dataset${datasets.length !== 1 ? "s" : ""} cross-referenced against ${articles.length} knowledge article${articles.length !== 1 ? "s" : ""}. ${dark.length} dataset${dark.length !== 1 ? "s have" : " has"} no documentation in the knowledge base — these are your dark datasets. ${documented.length} dataset${documented.length !== 1 ? "s are" : " is"} covered by existing articles. Recommend creating knowledge articles for the ${Math.min(dark.length, 3)} highest-priority undocumented datasets.`;
  } catch (_) {
    return "Dataset knowledge coverage advisor is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DatasetKnowledgeCoverage() {
  const [visible, setVisible]     = useState(false);
  const [datasets, setDatasets]   = useState([]);
  const [articles, setArticles]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("DARK");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [dsRaw, artRaw] = await Promise.all([
        fetch(`${apiBase()}/v1/datasets`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setDatasets(normaliseDatasets(dsRaw));
      setArticles(normaliseArticles(artRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:dsknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dsknow-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessDataset(ds) {
    setAssessing(ds.id);
    const artList = ds.matched.length > 0
      ? ds.matched.map((a) => `"${a.title}"`).join(", ")
      : "none";
    const prompt = `As JARVIS, provide a 2-sentence data-documentation advisory for the dataset "${ds.name}" (type: ${ds.type || "unclassified"}). Matching knowledge articles: ${artList}. Comment on the documentation gap and what kind of knowledge article would best describe this dataset.`;
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Documentation assessment unavailable, sir.";
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
      );
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Assessment unavailable at this time, sir." },
        })
      );
    }
    setAssessing(null);
  }

  const correlated   = correlate(datasets, articles);
  const dark         = correlated.filter((d) => d.matched.length === 0);
  const documented   = correlated.filter((d) => d.matched.length > 0);

  const base =
    tab === "DARK"       ? dark       :
    tab === "DOCUMENTED" ? documented : correlated;

  const displayed = search.trim()
    ? base.filter((d) =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.type.toLowerCase().includes(search.toLowerCase()) ||
        d.description.toLowerCase().includes(search.toLowerCase())
      )
    : base;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Dataset × Knowledge Coverage (F107)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 60,
          background: visible ? `${AMBER}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? AMBER : `${AMBER}44`}`,
          color: visible ? AMBER : `${AMBER}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ DSKNOW
        {dark.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{dark.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 300), zIndex: 60,
          width: 620, maxHeight: "72vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${AMBER}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${AMBER}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2 }}>
              ◈ DATASET × KNOWLEDGE COVERAGE
            </span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${AMBER}33`, borderRadius: 3,
                color: `${AMBER}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent", border: "none",
                color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, marginBottom: 10,
          }}>
            {[
              ["DATASETS",   datasets.length,  CY],
              ["ARTICLES",   articles.length,  GR],
              ["DOCUMENTED", documented.length, GREEN],
              ["DARK",       dark.length,       dark.length > 0 ? AMBER : "#445566"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>
                  {loading ? "…" : val}
                </div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {["DARK", "DOCUMENTED", "ALL"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${AMBER}22` : "transparent",
                border: `1px solid ${tab === t ? AMBER : "#1e3040"}`,
                color: tab === t ? AMBER : "#445566",
                borderRadius: 4, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search datasets…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.04)",
                border: `1px solid ${AMBER}33`, borderRadius: 4,
                color: "#DCEBF5", padding: "3px 8px", fontSize: 8,
                fontFamily: "'JetBrains Mono',monospace", outline: "none", width: 140,
              }}
            />
          </div>

          {/* Dataset rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating datasets against knowledge base…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "DARK" ? "All datasets have knowledge documentation." : "No items in this filter."}
            </div>
          ) : (
            displayed.map((ds) => {
              const isDark = ds.matched.length === 0;
              const isOpen = expanded === ds.id;
              return (
                <div
                  key={ds.id}
                  onClick={() => setExpanded(isOpen ? null : ds.id)}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${isOpen ? `${AMBER}44` : "#1a2530"}`,
                    borderLeft: `3px solid ${isDark ? AMBER : GREEN}`,
                    borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                    cursor: "pointer",
                  }}
                >
                  {/* Dataset header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    {ds.type && (
                      <span style={{
                        fontSize: 7, color: CY, border: "1px solid #29E7FF44",
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                        whiteSpace: "nowrap", textTransform: "uppercase",
                      }}>{String(ds.type).toUpperCase().slice(0, 10)}</span>
                    )}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{ds.name}</span>
                    {ds.row_count !== null && (
                      <span style={{ fontSize: 7, color: "#445566", whiteSpace: "nowrap" }}>
                        {ds.row_count.toLocaleString()} rows
                      </span>
                    )}
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: isDark ? AMBER : GREEN,
                    }}>
                      {isDark
                        ? "⚠ NO DOCS"
                        : `${ds.matched.length} article${ds.matched.length !== 1 ? "s" : ""}`}
                    </span>
                  </div>

                  {ds.description && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {ds.description.slice(0, 120)}
                      {ds.description.length > 120 ? "…" : ""}
                    </div>
                  )}

                  {/* Assess button */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessDataset(ds); }}
                      disabled={assessing === ds.id}
                      style={{
                        background: assessing === ds.id ? "#1a2530" : `${AMBER}18`,
                        color: assessing === ds.id ? "#445566" : AMBER,
                        border: `1px solid ${AMBER}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1,
                        cursor: assessing === ds.id ? "default" : "pointer",
                      }}
                    >
                      {assessing === ds.id ? "…assessing" : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* Expanded: matched articles or gap warning */}
                  {isOpen && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${AMBER}18` }}>
                      {ds.matched.length === 0 ? (
                        <div style={{
                          color: AMBER, fontSize: 8, lineHeight: 1.5,
                          background: `${AMBER}0a`, borderRadius: 4, padding: "6px 8px",
                        }}>
                          ⚠ No knowledge articles document this dataset. Creating documentation is recommended.
                        </div>
                      ) : (
                        ds.matched.map((art) => (
                          <div key={art.id} style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid #1e3040",
                            borderLeft: `3px solid ${GR}`,
                            borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                            display: "flex", alignItems: "flex-start", gap: 8,
                          }}>
                            {art.type && (
                              <span style={{
                                fontSize: 7, color: GR, border: "1px solid #4ADE8044",
                                borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                                whiteSpace: "nowrap", flexShrink: 0,
                              }}>
                                {String(art.type).toUpperCase().slice(0, 10)}
                              </span>
                            )}
                            <div style={{ flex: 1 }}>
                              <div style={{ color: "#a0b8cc", fontSize: 10 }}>{art.title}</div>
                              {art.content && (
                                <div style={{ color: "#445566", fontSize: 8, marginTop: 1 }}>
                                  {art.content.slice(0, 80)}
                                  {art.content.length > 80 ? "…" : ""}
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: 7, color: `${GR}66`, whiteSpace: "nowrap" }}>
                              match {art._score}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{
            marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right",
          }}>
            /v1/datasets + /knowledge/ · 120-s auto-refresh · ▶ ASSESS for AI documentation advisory
          </div>
        </div>
      )}
    </>
  );
}
