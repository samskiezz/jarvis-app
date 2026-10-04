/**
 * F730 — Dataset × Report × Knowledge Triple Nexus (DRKNTRI)
 *
 * Parallel-fetches /v1/datasets + /v1/reports + /knowledge/articles?limit=200,
 * then keyword-correlates each dataset against reports AND knowledge articles:
 *
 *   FULLY_DOCUMENTED — matched ≥1 report AND ≥1 article (fully evidenced)
 *   REPORT_ONLY      — has formal report, no knowledge article
 *   KNOWLEDGE_ONLY   — has KB article, no formal report
 *   DARK             — no report, no article (documentation gap)
 *
 * Stat tiles: DATASETS | FULLY DOC | REPORT ONLY | KB ONLY | DARK
 * Filter tabs: ALL | FULLY_DOCUMENTED | REPORT_ONLY | KNOWLEDGE_ONLY | DARK + search
 * Expand dataset → matched reports (type badge + hits) + matched articles (kind badge + hits)
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence coverage brief + TTS
 *
 * Button: ◈ DRKNTRI  left:900380 bottom:8 zIndex:589
 * Event:  jarvis:drkntri-toggle
 * Refresh: 90 s auto-poll
 * Voice:  "drkntri / dataset report knowledge / dataset documentation / dark datasets /
 *          dataset knowledge gap / documented datasets / dataset coverage triple /
 *          dataset report coverage / knowledge dataset"
 */

import { useCallback, useEffect, useRef, useState } from "react";

const CY = "#29E7FF";
const AM = "#FFB347";
const GN = "#39FF14";
const RD = "#FF4444";
const PR = "#B47FFF";
const BTN_LEFT = 900380;
const POLL_MS  = 90_000;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  return env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:8000";
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.kind, obj.type,
    obj.source, obj.domain, obj.topic, obj.status, obj.category,
    obj.tags?.join?.(" "),
  ].filter(Boolean).join(" ").toLowerCase();
}

function scoreMatch(aKw, bKw) {
  const words = aKw.split(/\s+/).filter((w) => w.length > 3);
  let hits = 0;
  for (const w of words) if (bKw.includes(w)) hits++;
  return hits;
}

function classify(dataset, reports, articles) {
  const dkw = keywords(dataset);
  const matchedReports = reports
    .map((r) => ({ ...r, hits: scoreMatch(dkw, keywords(r)) }))
    .filter((r) => r.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5);
  const matchedArticles = articles
    .map((a) => ({ ...a, hits: scoreMatch(dkw, keywords(a)) }))
    .filter((a) => a.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5);
  const hasReports   = matchedReports.length > 0;
  const hasArticles  = matchedArticles.length > 0;
  const status =
    hasReports && hasArticles ? "FULLY_DOCUMENTED" :
    hasReports                ? "REPORT_ONLY"      :
    hasArticles               ? "KNOWLEDGE_ONLY"   :
                                "DARK";
  return { ...dataset, status, matchedReports, matchedArticles };
}

async function fetchAll() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [dsetR, rptR, knoR] = await Promise.all([
    fetch(`${base}/v1/datasets`,                    { headers }),
    fetch(`${base}/v1/reports`,                     { headers }),
    fetch(`${base}/knowledge/articles?limit=200`,   { headers }),
  ]);
  const dsetJ = dsetR.ok ? await dsetR.json() : [];
  const rptJ  = rptR.ok  ? await rptR.json()  : [];
  const knoJ  = knoR.ok  ? await knoR.json()  : [];

  const datasets  = Array.isArray(dsetJ) ? dsetJ : (dsetJ.datasets || dsetJ.items || []);
  const reports   = Array.isArray(rptJ)  ? rptJ  : (rptJ.reports  || rptJ.items  || []);
  const articles  = Array.isArray(knoJ)  ? knoJ  : (knoJ.articles || knoJ.items  || []);
  return { datasets, reports, articles };
}

const STATUS_COLOR = {
  FULLY_DOCUMENTED: GN,
  REPORT_ONLY:      CY,
  KNOWLEDGE_ONLY:   AM,
  DARK:             RD,
};

const TABS = ["ALL", "FULLY_DOCUMENTED", "REPORT_ONLY", "KNOWLEDGE_ONLY", "DARK"];

export default function DatasetReportKnowledgeTriple() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [reports,  setReports]  = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState(null);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { datasets, reports: rpts, articles: arts } = await fetchAll();
      setReports(rpts);
      setArticles(arts);
      setRows(datasets.map((d) => classify(d, rpts, arts)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:drkntri-toggle", toggle);
    return () => window.removeEventListener("jarvis:drkntri-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const counts = {
    FULLY_DOCUMENTED: rows.filter((r) => r.status === "FULLY_DOCUMENTED").length,
    REPORT_ONLY:      rows.filter((r) => r.status === "REPORT_ONLY").length,
    KNOWLEDGE_ONLY:   rows.filter((r) => r.status === "KNOWLEDGE_ONLY").length,
    DARK:             rows.filter((r) => r.status === "DARK").length,
  };

  const visible = rows.filter((r) => {
    const matchTab = tab === "ALL" || r.status === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || (r.name || r.title || "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const assess = async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const summary =
        `Datasets: ${rows.length}. Fully documented: ${counts.FULLY_DOCUMENTED}. ` +
        `Report-only: ${counts.REPORT_ONLY}. Knowledge-only: ${counts.KNOWLEDGE_ONLY}. ` +
        `Dark (no coverage): ${counts.DARK}.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: `Dataset documentation coverage: ${summary}. Provide a 2-sentence assessment of coverage gaps and recommended actions.` }),
      });
      const d = await r.json();
      const text = (d.answer || "Assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      /* silent */
    } finally {
      setAssessing(false);
    }
  };

  const darkCount = counts.DARK;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 589,
          background: darkCount > 0 ? `${RD}22` : "#0a0a1a",
          border: `1px solid ${darkCount > 0 ? RD : CY}44`,
          color: darkCount > 0 ? RD : CY,
          padding: "4px 10px", borderRadius: 6, fontSize: 11,
          fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ DRKNTRI{darkCount > 0 ? ` [${darkCount}]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, width: 540, maxHeight: "80vh",
      background: "#07091a", border: `1px solid ${CY}44`, borderRadius: 10,
      zIndex: 6000, overflowY: "auto", fontFamily: "monospace", fontSize: 12,
      color: "#ccc", display: "flex", flexDirection: "column",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px",
                    borderBottom: `1px solid ${CY}22`, gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 13, flex: 1 }}>
          ◈ DATASET × REPORT × KNOWLEDGE (DRKNTRI)
        </span>
        <button onClick={assess} disabled={assessing || loading}
          style={{ background: `${GN}22`, border: `1px solid ${GN}44`, color: GN,
                   padding: "2px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 15 }}>
          ✕
        </button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", flexShrink: 0 }}>
        {[
          ["DATASETS",  rows.length,             CY],
          ["FULLY DOC", counts.FULLY_DOCUMENTED, GN],
          ["RPT ONLY",  counts.REPORT_ONLY,       CY],
          ["KB ONLY",   counts.KNOWLEDGE_ONLY,    AM],
          ["DARK",      counts.DARK,              RD],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{ flex: 1, background: `${col}11`, border: `1px solid ${col}33`,
                                  borderRadius: 6, padding: "4px 6px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#666", fontSize: 9 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 6px", flexShrink: 0, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ background: tab === t ? `${CY}22` : "transparent",
                     border: `1px solid ${tab === t ? CY : "#333"}`,
                     color: tab === t ? CY : "#555",
                     padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10 }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
        <input
          placeholder="search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginLeft: "auto", background: "#111", border: `1px solid #333`,
                   color: "#aaa", padding: "2px 8px", borderRadius: 4, fontSize: 10, width: 100 }}
        />
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 14px" }}>
        {loading && <div style={{ color: "#555", padding: 12 }}>Loading…</div>}
        {err     && <div style={{ color: RD,    padding: 12 }}>Error: {err}</div>}
        {!loading && !err && visible.length === 0 && (
          <div style={{ color: "#555", padding: 12 }}>No datasets match.</div>
        )}
        {visible.map((row, i) => {
          const col   = STATUS_COLOR[row.status] || CY;
          const isExp = expanded === i;
          return (
            <div key={i}
              style={{ borderBottom: `1px solid #1a1a2e`, padding: "8px 0" }}>
              <div onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 110 }}>
                  {row.status.replace(/_/g, " ")}
                </span>
                <span style={{ color: "#ddd", flex: 1, overflow: "hidden",
                               textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.name || row.title || `Dataset ${i + 1}`}
                </span>
                {row.row_count != null && (
                  <span style={{ color: "#444", fontSize: 10 }}>
                    {Number(row.row_count).toLocaleString()} rows
                  </span>
                )}
                <span style={{ color: "#444" }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ marginTop: 6, paddingLeft: 10 }}>
                  {row.matchedReports.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: CY, fontSize: 10, marginBottom: 3 }}>Reports</div>
                      {row.matchedReports.map((r, j) => (
                        <div key={j} style={{ display: "flex", gap: 6, alignItems: "center",
                                              marginBottom: 2 }}>
                          <span style={{ background: `${CY}22`, color: CY, padding: "1px 5px",
                                         borderRadius: 3, fontSize: 9 }}>
                            {r.type || r.kind || "RPT"}
                          </span>
                          <span style={{ color: "#bbb", fontSize: 11, flex: 1,
                                         overflow: "hidden", textOverflow: "ellipsis",
                                         whiteSpace: "nowrap" }}>
                            {r.title || r.name}
                          </span>
                          <span style={{ color: "#555", fontSize: 9 }}>{r.hits} hits</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {row.matchedArticles.length > 0 && (
                    <div>
                      <div style={{ color: AM, fontSize: 10, marginBottom: 3 }}>Knowledge Articles</div>
                      {row.matchedArticles.map((a, j) => (
                        <div key={j} style={{ display: "flex", gap: 6, alignItems: "center",
                                              marginBottom: 2 }}>
                          <span style={{ background: `${AM}22`, color: AM, padding: "1px 5px",
                                         borderRadius: 3, fontSize: 9 }}>
                            {a.kind || a.type || a.category || "ART"}
                          </span>
                          <span style={{ color: "#bbb", fontSize: 11, flex: 1,
                                         overflow: "hidden", textOverflow: "ellipsis",
                                         whiteSpace: "nowrap" }}>
                            {a.title || a.name}
                          </span>
                          <span style={{ color: "#555", fontSize: 9 }}>{a.hits} hits</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {row.matchedReports.length === 0 && row.matchedArticles.length === 0 && (
                    <div style={{ color: "#444", fontSize: 10 }}>No documentation found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── JarvisBrain intent exports ──────────────────────────────────────────────

const DRKNTRI_RE = /drkntri|dataset report knowledge|dataset documentation|dark datasets|dataset knowledge gap|documented datasets|dataset coverage triple|dataset report coverage|knowledge dataset/i;

export function isDrkntriQuery(q) {
  return DRKNTRI_RE.test(q);
}

export async function buildDrkntriScript() {
  try {
    const { datasets, reports, articles } = await fetchAll();
    const classified = datasets.map((d) => classify(d, reports, articles));
    const fully = classified.filter((r) => r.status === "FULLY_DOCUMENTED").length;
    const rOnly = classified.filter((r) => r.status === "REPORT_ONLY").length;
    const kOnly = classified.filter((r) => r.status === "KNOWLEDGE_ONLY").length;
    const dark  = classified.filter((r) => r.status === "DARK").length;
    return (
      `Dataset documentation coverage: ${datasets.length} datasets total. ` +
      `${fully} fully documented (report + KB article), ` +
      `${rOnly} report-only, ${kOnly} knowledge-only, ` +
      `${dark} dark (no coverage). ` +
      (dark > 0 ? `${dark} dataset${dark > 1 ? "s" : ""} lack any documentation — immediate attention recommended.` : "All datasets have some documentation coverage.")
    );
  } catch {
    return "Dataset × Report × Knowledge Nexus: data unavailable.";
  }
}
