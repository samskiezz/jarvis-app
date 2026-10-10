/**
 * SwarmDatasetKnowledgeNexus — F49 (overnight 2026-09-13)
 * Sources: /entities/SwarmJob × /v1/datasets × /knowledge/
 * Keyword-correlates each swarm job against datasets AND knowledge articles:
 *   FULLY_SUPPORTED  (job has both matching dataset + knowledge article)
 *   DATA_ONLY        (matched a dataset but no knowledge article)
 *   KNOWLEDGE_ONLY   (matched a knowledge article but no dataset)
 *   UNSUPPORTED      (no dataset or knowledge article matches)
 * Stat tiles: swarm jobs / fully supported / data only / knowledge only / unsupported.
 * Filter tabs: ALL / FULLY_SUPPORTED / DATA_ONLY / KNOWLEDGE_ONLY / UNSUPPORTED.
 * Text search on job name/type/status.
 * Expand row → matched datasets (cyan bars) + matched knowledge articles (amber bars).
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * ◈ SDKNEX button (left:935540 bottom:8 zIndex:632).
 * Voice triggers: "sdknex" / "swarm dataset" / "swarm knowledge" /
 *                 "unsupported swarm" / "swarm coverage" / "swarm data knowledge".
 * Toggle: jarvis:sdknex-toggle event.
 * 90-s auto-refresh.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA040";
const RED = "#FF4D6D";
const PRP = "#A855F7";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SDKNEX_RE =
  /\bsdknex\b|swarm.dataset|swarm.knowledge|unsupported.swarm|swarm.coverage|swarm.data.knowledge|swarm.resource.gap|swarm.backing/i;

// ── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchSwarmJobs() {
  const r = await fetch(`${apiBase()}/entities/SwarmJob`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.swarmJobs)  ? d.swarmJobs
    : Array.isArray(d?.jobs)       ? d.jobs
    : Array.isArray(d?.data)       ? d.data
    : Array.isArray(d?.results)    ? d.results
    : [];
}

async function fetchDatasets() {
  const r = await fetch(`${apiBase()}/v1/datasets`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.datasets) ? d.datasets
    : Array.isArray(d?.data)     ? d.data
    : Array.isArray(d?.results)  ? d.results
    : [];
}

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.articles)  ? d.articles
    : Array.isArray(d?.knowledge) ? d.knowledge
    : Array.isArray(d?.data)      ? d.data
    : Array.isArray(d?.results)   ? d.results
    : [];
}

// ── keyword matching ──────────────────────────────────────────────────────────

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function overlap(tokensA, tokensB) {
  const setB = new Set(tokensB);
  return tokensA.filter((t) => setB.has(t)).length;
}

function swarmTokens(j) {
  return tokenize(
    [j.name, j.title, j.type, j.kind, j.goal, j.objective,
     j.description, j.tags?.join?.(" "), j.target, j.topic].join(" ")
  );
}

function datasetTokens(ds) {
  return tokenize(
    [ds.name, ds.title, ds.description, ds.type, ds.category,
     ds.source, ds.topic, ds.tags?.join?.(" ")].join(" ")
  );
}

function knowledgeTokens(k) {
  return tokenize(
    [k.title, k.name, k.summary, k.description, k.category,
     k.kind, k.topic, k.tags?.join?.(" "), k.content].join(" ")
  );
}

function classifyJob(job, datasets, articles) {
  const jToks = swarmTokens(job);
  const matchedDatasets = datasets
    .map((ds) => ({ item: ds, score: overlap(jToks, datasetTokens(ds)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const matchedKnowledge = articles
    .map((k) => ({ item: k, score: overlap(jToks, knowledgeTokens(k)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const hasData = matchedDatasets.length > 0;
  const hasKnow = matchedKnowledge.length > 0;
  const status =
    hasData && hasKnow ? "FULLY_SUPPORTED"
    : hasData          ? "DATA_ONLY"
    : hasKnow          ? "KNOWLEDGE_ONLY"
    :                    "UNSUPPORTED";

  return { job, matchedDatasets, matchedKnowledge, status };
}

// ── exported voice helpers ────────────────────────────────────────────────────

export function isSdknexQuery(q) {
  return SDKNEX_RE.test(q || "");
}

export async function buildSdknexScript() {
  try {
    const [jobs, datasets, articles] = await Promise.all([
      fetchSwarmJobs(), fetchDatasets(), fetchKnowledge(),
    ]);
    const rows        = jobs.map((j) => classifyJob(j, datasets, articles));
    const unsupported = rows.filter((r) => r.status === "UNSUPPORTED").length;
    const fully       = rows.filter((r) => r.status === "FULLY_SUPPORTED").length;
    return (
      `Swarm dataset and knowledge nexus: ${rows.length} swarm jobs correlated against ` +
      `${datasets.length} datasets and ${articles.length} knowledge articles. ` +
      `${fully} jobs are fully supported with both data and knowledge backing. ` +
      (unsupported > 0
        ? `${unsupported} jobs are unsupported — no dataset or knowledge article coverage found.`
        : "All jobs have at least one data or knowledge resource aligned.")
    );
  } catch {
    return "Unable to fetch swarm dataset knowledge nexus data at this time, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "FULLY_SUPPORTED", "DATA_ONLY", "KNOWLEDGE_ONLY", "UNSUPPORTED"];

const STATUS_COLOR = {
  FULLY_SUPPORTED: GRN,
  DATA_ONLY:       CY,
  KNOWLEDGE_ONLY:  AMB,
  UNSUPPORTED:     PRP,
};

export default function SwarmDatasetKnowledgeNexus() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jobs, datasets, articles] = await Promise.all([
        fetchSwarmJobs(), fetchDatasets(), fetchKnowledge(),
      ]);
      setRows(jobs.map((j) => classifyJob(j, datasets, articles)));
    } catch {
      /* silent — no fake data */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:sdknex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sdknex-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const unsupportedCount  = rows.filter((r) => r.status === "UNSUPPORTED").length;
  const fullyCount        = rows.filter((r) => r.status === "FULLY_SUPPORTED").length;
  const dataOnly          = rows.filter((r) => r.status === "DATA_ONLY").length;
  const knowledgeOnly     = rows.filter((r) => r.status === "KNOWLEDGE_ONLY").length;

  const visible = rows.filter((r) => {
    if (filter !== "ALL" && r.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const j = r.job;
      return [j.name, j.title, j.type, j.kind, j.goal, j.topic]
        .some((f) => (f || "").toLowerCase().includes(q));
    }
    return true;
  });

  async function assess() {
    const script = await buildSdknexScript();
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }

  const tile = (label, val, col) => (
    <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", borderRadius: 6,
      padding: "6px 8px", textAlign: "center", border: `1px solid ${col}33` }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
    </div>
  );

  const maxScore = (arr) => Math.max(...arr.map((x) => x.score), 1);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:sdknex-toggle"))}
        style={{
          position: "fixed", left: 935540, bottom: 8, zIndex: 632,
          background: "rgba(5,8,13,0.75)", border: `1px solid ${unsupportedCount > 0 ? PRP : CY}55`,
          color: unsupportedCount > 0 ? PRP : CY, borderRadius: 6, padding: "3px 9px",
          fontSize: 10, letterSpacing: 1, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ SDKNEX{unsupportedCount > 0 && (
          <span style={{ marginLeft: 4, background: PRP, color: "#fff",
            borderRadius: 8, padding: "1px 5px", fontSize: 9 }}>
            {unsupportedCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: "8vh", left: "50%", transform: "translateX(-50%)",
          zIndex: 10000, width: "min(780px,94vw)",
          background: "rgba(5,10,18,0.95)", border: `1px solid ${CY}44`,
          borderRadius: 14, padding: "18px 20px",
          backdropFilter: "blur(14px)", boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          maxHeight: "84vh", display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 13,
                textShadow: `0 0 12px ${CY}` }}>SWARM DATASET KNOWLEDGE NEXUS</span>
              <span style={{ marginLeft: 10, color: "#4A6070", fontSize: 10 }}>
                /entities/SwarmJob × /v1/datasets × /knowledge/
              </span>
            </div>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#4A6070",
                cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {tile("SWARM JOBS",       rows.length,      CY)}
            {tile("FULLY SUPPORTED",  fullyCount,       GRN)}
            {tile("DATA ONLY",        dataOnly,         CY)}
            {tile("KNOWLEDGE ONLY",   knowledgeOnly,    AMB)}
            {tile("UNSUPPORTED",      unsupportedCount, PRP)}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${STATUS_COLOR[f] || CY}22` : "transparent",
                  border: `1px solid ${filter === f ? (STATUS_COLOR[f] || CY) : "#2A3A4A"}`,
                  color: filter === f ? (STATUS_COLOR[f] || CY) : "#4A6070",
                  borderRadius: 6, padding: "3px 10px", fontSize: 10,
                  cursor: "pointer", letterSpacing: 1,
                }}>
                {f}
              </button>
            ))}
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="search swarm jobs…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.3)",
                border: `1px solid ${CY}44`, borderRadius: 6, color: "#DCEBF5",
                padding: "3px 10px", fontSize: 10, width: 160,
                fontFamily: "'JetBrains Mono',monospace",
              }}
            />
          </div>

          {/* Swarm job list */}
          <div style={{ overflowY: "auto", flex: 1, paddingRight: 4 }}>
            {loading && (
              <div style={{ textAlign: "center", color: "#4A6070", padding: 24, fontSize: 12 }}>
                loading…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ textAlign: "center", color: "#4A6070", padding: 24, fontSize: 12 }}>
                No swarm jobs match
              </div>
            )}
            {visible.map((row, i) => {
              const j     = row.job;
              const isExp = expanded === i;
              const col   = STATUS_COLOR[row.status] || CY;
              const name  = (j.name || j.title || j.kind || "Swarm Job").slice(0, 60);
              const type  = (j.type || j.kind || "").slice(0, 30);
              const status = (j.status || j.state || "").slice(0, 20);
              return (
                <div key={i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    marginBottom: 6, padding: "8px 10px",
                    background: isExp ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.2)",
                    border: `1px solid ${col}33`,
                    borderRadius: 8, cursor: "pointer",
                    borderLeft: row.status === "UNSUPPORTED" ? `3px solid ${PRP}` : `3px solid ${col}66`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "#DCEBF5", fontWeight: 600,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 9, color: "#4A6070", marginTop: 2 }}>
                        {type   && <span style={{ marginRight: 8 }}>{type}</span>}
                        {status && <span style={{ color: "#6E8AA0" }}>{status}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 8, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 9, letterSpacing: 1, color: col,
                        border: `1px solid ${col}66`, borderRadius: 4, padding: "2px 6px",
                      }}>{row.status}</span>
                      <span style={{ color: "#4A6070", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {/* Datasets */}
                      <div>
                        <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 6 }}>
                          MATCHED DATASETS ({row.matchedDatasets.length})
                        </div>
                        {row.matchedDatasets.length === 0
                          ? <div style={{ fontSize: 9, color: "#4A6070" }}>no matching datasets</div>
                          : row.matchedDatasets.map((x, j2) => {
                              const pct = Math.min(100, Math.round((x.score / maxScore(row.matchedDatasets)) * 100));
                              return (
                                <div key={j2} style={{ marginBottom: 4 }}>
                                  <div style={{ fontSize: 9, color: "#DCEBF5", marginBottom: 2,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {(x.item.name || x.item.title || x.item.id || "Dataset").slice(0, 40)}
                                  </div>
                                  <div style={{ height: 4, background: "rgba(0,0,0,0.3)", borderRadius: 2 }}>
                                    <div style={{ height: "100%", width: `${pct}%`,
                                      background: CY, borderRadius: 2 }} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>
                      {/* Knowledge articles */}
                      <div>
                        <div style={{ fontSize: 9, color: AMB, letterSpacing: 1, marginBottom: 6 }}>
                          MATCHED KNOWLEDGE ({row.matchedKnowledge.length})
                        </div>
                        {row.matchedKnowledge.length === 0
                          ? <div style={{ fontSize: 9, color: "#4A6070" }}>no matching knowledge articles</div>
                          : row.matchedKnowledge.map((x, j2) => {
                              const pct = Math.min(100, Math.round((x.score / maxScore(row.matchedKnowledge)) * 100));
                              return (
                                <div key={j2} style={{ marginBottom: 4 }}>
                                  <div style={{ fontSize: 9, color: "#DCEBF5", marginBottom: 2,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {(x.item.title || x.item.name || "Article").slice(0, 40)}
                                  </div>
                                  <div style={{ height: 4, background: "rgba(0,0,0,0.3)", borderRadius: 2 }}>
                                    <div style={{ height: "100%", width: `${pct}%`,
                                      background: AMB, borderRadius: 2 }} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between",
            alignItems: "center", borderTop: `1px solid ${CY}22`, paddingTop: 10 }}>
            <span style={{ fontSize: 9, color: "#4A6070" }}>
              {visible.length} / {rows.length} swarm jobs • auto-refresh 90 s
            </span>
            <button onClick={assess}
              style={{
                background: `${CY}18`, border: `1px solid ${CY}66`,
                color: CY, borderRadius: 6, padding: "4px 14px",
                fontSize: 10, cursor: "pointer", letterSpacing: 1,
                fontFamily: "'JetBrains Mono',monospace",
              }}>
              ▶ ASSESS
            </button>
          </div>
        </div>
      )}
    </>
  );
}
