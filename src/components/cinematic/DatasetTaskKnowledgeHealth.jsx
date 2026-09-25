/**
 * F90 — Dataset × Task × Knowledge Coverage Health Report (DTKHEALTH)
 * Endpoints: /v1/datasets × /entities/Task × /knowledge/
 * Classification:
 *   FULLY_GROUNDED  — dataset matched a task AND a KB article
 *   TASK_LINKED     — dataset matched a task only
 *   KB_NOTED        — dataset matched a KB article only
 *   ORPHANED        — no match (neither task nor KB article covers this dataset)
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 993_320;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  import.meta.env?.VITE_API_KEY ||
  "";

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

const DTKHEALTH_RE =
  /\b(dtkhealth|dataset\s*task\s*knowledge|dataset\s*coverage(\s*health)?|dataset\s*health|orphaned\s*datasets?|dataset\s*grounding|knowledge\s*dataset|dataset\s*kb|dtk\s*health|data\s*coverage\s*health)\b/i;

export function isDtkhealthQuery(t) {
  return DTKHEALTH_RE.test(t || "");
}

function normaliseDataset(raw) {
  if (!raw) return null;
  return {
    id:          raw.id          || raw.dataset_id || raw._id   || String(Math.random()),
    name:        raw.name        || raw.title      || raw.label  || "Unnamed Dataset",
    description: raw.description || raw.summary    || raw.about  || "",
    type:        raw.type        || raw.category   || raw.kind   || "",
    tags:        Array.isArray(raw.tags)  ? raw.tags  : [],
    rowCount:    raw.row_count   || raw.rows        || raw.count  || null,
  };
}

function normaliseTask(raw) {
  if (!raw) return null;
  return {
    id:          raw.id    || raw.task_id  || raw._id || String(Math.random()),
    name:        raw.name  || raw.title    || raw.subject  || "Untitled Task",
    description: raw.description || raw.details || raw.summary || "",
    status:      raw.status || raw.state || "",
    tags:        Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function normaliseKbArticle(raw) {
  if (!raw) return null;
  return {
    id:          raw.id     || raw.article_id || raw._id || String(Math.random()),
    name:        raw.name   || raw.title      || raw.heading || "Untitled Article",
    description: raw.description || raw.summary  || raw.excerpt  || raw.body || "",
    tags:        Array.isArray(raw.tags) ? raw.tags : [],
    category:    raw.category || raw.type || "",
  };
}

function tokenize(s) {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreMatch(dsTokens, item) {
  const itemTokens = tokenize(
    `${item.name} ${item.description || ""} ${(item.tags || []).join(" ")} ${item.category || ""} ${item.status || ""}`
  );
  if (!dsTokens.length || !itemTokens.length) return 0;
  const set = new Set(itemTokens);
  return dsTokens.filter((t) => set.has(t)).length;
}

const TE = "#00e5ff";
const GR = "#4ade80";
const AM = "#ffc107";
const OR = "#fb923c";

const CLASS_META = {
  FULLY_GROUNDED: { label: "FULLY GROUNDED", color: GR,        desc: "Matched a task AND a KB article" },
  TASK_LINKED:    { label: "TASK LINKED",    color: TE,        desc: "Matched a task only" },
  KB_NOTED:       { label: "KB NOTED",       color: "#a78bfa", desc: "Matched a KB article only" },
  ORPHANED:       { label: "ORPHANED",       color: OR,        desc: "No task or KB article covers this dataset" },
};

const TABS = ["ALL", "FULLY_GROUNDED", "TASK_LINKED", "KB_NOTED", "ORPHANED"];

export async function buildDtkhealthScript() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [dsRes, tkRes, kbRes] = await Promise.allSettled([
    fetch(`${base}/v1/datasets`,      { headers }).then((r) => r.json()),
    fetch(`${base}/entities/Task`,    { headers }).then((r) => r.json()),
    fetch(`${base}/knowledge/`,       { headers }).then((r) => r.json()),
  ]);

  const datasets  = dsRes.status === "fulfilled" ? dsRes.value : [];
  const tasks     = tkRes.status === "fulfilled" ? tkRes.value : [];
  const kbArticles = kbRes.status === "fulfilled" ? kbRes.value : [];

  const dsArr = (Array.isArray(datasets)   ? datasets   : datasets?.items   || datasets?.data   || []).map(normaliseDataset).filter(Boolean);
  const tkArr = (Array.isArray(tasks)      ? tasks      : tasks?.items      || tasks?.data      || []).map(normaliseTask).filter(Boolean);
  const kbArr = (Array.isArray(kbArticles) ? kbArticles : kbArticles?.items || kbArticles?.data || []).map(normaliseKbArticle).filter(Boolean);

  const counts = { FULLY_GROUNDED: 0, TASK_LINKED: 0, KB_NOTED: 0, ORPHANED: 0 };
  for (const ds of dsArr) {
    const tok    = tokenize(`${ds.name} ${ds.description} ${ds.type} ${ds.tags.join(" ")}`);
    const hasTask = tkArr.some((t) => scoreMatch(tok, t) > 0);
    const hasKb   = kbArr.some((k) => scoreMatch(tok, k) > 0);
    if (hasTask && hasKb)  counts.FULLY_GROUNDED++;
    else if (hasTask)      counts.TASK_LINKED++;
    else if (hasKb)        counts.KB_NOTED++;
    else                   counts.ORPHANED++;
  }

  const total = dsArr.length;
  const groundedPct = total > 0 ? Math.round(((counts.FULLY_GROUNDED + counts.TASK_LINKED + counts.KB_NOTED) / total) * 100) : 0;

  return `Dataset coverage health report, sir. ${total} datasets analysed. ${counts.FULLY_GROUNDED} fully grounded with task and knowledge coverage. ${counts.TASK_LINKED} task-linked only. ${counts.KB_NOTED} KB-noted only. ${counts.ORPHANED} orphaned datasets with no task or knowledge article coverage. Overall coverage health stands at ${groundedPct} percent. ${counts.ORPHANED > 0 ? `Recommend reviewing the ${counts.ORPHANED} orphaned dataset${counts.ORPHANED !== 1 ? "s" : ""} for integration into active tasks or knowledge base articles.` : "All datasets are grounded. Dataset health is strong."}`;
}

export default function DatasetTaskKnowledgeHealth() {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [rows, setRows]       = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [lastPoll, setLastPoll] = useState(null);
  const timerRef              = useRef(null);

  async function fetchData() {
    setLoading(true);
    setError(null);
    const base    = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [dsRes, tkRes, kbRes] = await Promise.allSettled([
        fetch(`${base}/v1/datasets`,      { headers }).then((r) => r.json()),
        fetch(`${base}/entities/Task`,    { headers }).then((r) => r.json()),
        fetch(`${base}/knowledge/`,       { headers }).then((r) => r.json()),
      ]);

      const datasets   = dsRes.status === "fulfilled" ? dsRes.value : [];
      const tasks      = tkRes.status === "fulfilled" ? tkRes.value : [];
      const kbArticles = kbRes.status === "fulfilled" ? kbRes.value : [];

      const dsArr = (Array.isArray(datasets)   ? datasets   : datasets?.items   || datasets?.data   || []).map(normaliseDataset).filter(Boolean);
      const tkArr = (Array.isArray(tasks)      ? tasks      : tasks?.items      || tasks?.data      || []).map(normaliseTask).filter(Boolean);
      const kbArr = (Array.isArray(kbArticles) ? kbArticles : kbArticles?.items || kbArticles?.data || []).map(normaliseKbArticle).filter(Boolean);

      const classified = dsArr.map((ds) => {
        const tok = tokenize(`${ds.name} ${ds.description} ${ds.type} ${ds.tags.join(" ")}`);
        const matchedTasks = tkArr
          .map((t) => ({ ...t, score: scoreMatch(tok, t) }))
          .filter((t) => t.score > 0)
          .sort((a, b) => b.score - a.score);
        const matchedKb = kbArr
          .map((k) => ({ ...k, score: scoreMatch(tok, k) }))
          .filter((k) => k.score > 0)
          .sort((a, b) => b.score - a.score);

        const hasTask = matchedTasks.length > 0;
        const hasKb   = matchedKb.length > 0;
        let cls;
        if (hasTask && hasKb)  cls = "FULLY_GROUNDED";
        else if (hasTask)      cls = "TASK_LINKED";
        else if (hasKb)        cls = "KB_NOTED";
        else                   cls = "ORPHANED";

        return { ...ds, cls, matchedTasks, matchedKb };
      });

      setRows(classified);
      setLastPoll(new Date());
    } catch (e) {
      setError(e.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onToggle() { setOpen((v) => { if (!v) fetchData(); return !v; }); }
    window.addEventListener("jarvis:dtkhealth-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dtkhealth-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const counts = { FULLY_GROUNDED: 0, TASK_LINKED: 0, KB_NOTED: 0, ORPHANED: 0 };
  rows.forEach((r) => counts[r.cls]++);

  const visible = rows.filter((r) => {
    const matchTab = tab === "ALL" || r.cls === tab;
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.description.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const total       = rows.length;
  const groundedPct = total > 0 ? Math.round(((counts.FULLY_GROUNDED + counts.TASK_LINKED + counts.KB_NOTED) / total) * 100) : 0;

  const btnStyle = {
    position:    "fixed",
    bottom:      8,
    left:        BTN_LEFT,
    zIndex:      152,
    background:  "rgba(0,20,40,0.85)",
    border:      `1px solid ${counts.ORPHANED > 0 ? AM : "#1E3A5F"}`,
    color:       counts.ORPHANED > 0 ? AM : "#7BB8D4",
    padding:     "3px 9px",
    fontSize:    10,
    cursor:      "pointer",
    borderRadius: 4,
    fontFamily:  "monospace",
    letterSpacing: 1,
    transition:  "all 0.2s",
  };

  return (
    <>
      <button style={btnStyle} onClick={() => { setOpen((v) => { if (!v) fetchData(); return !v; })} }>
        ◈ DTKHEALTH{counts.ORPHANED > 0 && (
          <span style={{
            marginLeft:    5,
            background:    AM,
            color:         "#000",
            borderRadius:  3,
            padding:       "0 4px",
            fontSize:      9,
            fontWeight:    700,
          }}>{counts.ORPHANED}</span>
        )}
      </button>

      {open && (
        <div style={{
          position:        "fixed",
          bottom:          40,
          left:            "50%",
          transform:       "translateX(-50%)",
          width:           760,
          maxHeight:       540,
          background:      "rgba(4,12,24,0.97)",
          border:          "1px solid #1E3A5F",
          borderRadius:    8,
          zIndex:          10000,
          display:         "flex",
          flexDirection:   "column",
          fontFamily:      "monospace",
          boxShadow:       "0 0 40px rgba(0,229,255,0.08)",
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid #1E3A5F", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: TE, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
              ◈ DATASET × TASK × KNOWLEDGE — COVERAGE HEALTH
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6E8AA0", fontSize: 14, cursor: "pointer" }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: "1px solid #0d2035" }}>
            {[
              { label: "TOTAL",          value: total,                  color: "#7BB8D4" },
              { label: "FULLY GROUNDED", value: counts.FULLY_GROUNDED,  color: GR },
              { label: "TASK LINKED",    value: counts.TASK_LINKED,     color: TE },
              { label: "KB NOTED",       value: counts.KB_NOTED,        color: "#a78bfa" },
              { label: "ORPHANED",       value: counts.ORPHANED,        color: OR },
              { label: "COVERAGE",       value: `${groundedPct}%`,      color: groundedPct >= 70 ? GR : groundedPct >= 40 ? AM : OR },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, background: "#061728", borderRadius: 4, padding: "6px 0", textAlign: "center", border: "1px solid #1E3A5F" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 8, color: "#6E8AA0", marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div style={{ padding: "4px 14px 6px", borderBottom: "1px solid #0d2035" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#6E8AA0", marginBottom: 3 }}>
              <span>COVERAGE HEALTH</span>
              <span>{groundedPct}%</span>
            </div>
            <div style={{ background: "#111827", borderRadius: 4, height: 5 }}>
              <div style={{
                width:       `${groundedPct}%`,
                height:      "100%",
                background:  groundedPct >= 70 ? GR : groundedPct >= 40 ? AM : OR,
                borderRadius: 4,
                transition:  "width 0.6s",
              }} />
            </div>
          </div>

          {/* Search + tabs */}
          <div style={{ padding: "6px 14px", borderBottom: "1px solid #0d2035", display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search datasets…"
              style={{ flex: 1, background: "#061728", border: "1px solid #1E3A5F", borderRadius: 4, color: "#DCEBF5", padding: "4px 8px", fontSize: 11, outline: "none", fontFamily: "monospace" }}
            />
            <div style={{ display: "flex", gap: 4 }}>
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  background:   tab === t ? "#0d2035" : "transparent",
                  border:       `1px solid ${tab === t ? TE : "#1E3A5F"}`,
                  color:        tab === t ? TE : "#6E8AA0",
                  borderRadius: 3,
                  padding:      "2px 7px",
                  fontSize:     9,
                  cursor:       "pointer",
                  fontFamily:   "monospace",
                }}>
                  {t === "ALL" ? `ALL(${total})` : t === "FULLY_GROUNDED" ? `GR(${counts.FULLY_GROUNDED})` : t === "TASK_LINKED" ? `TK(${counts.TASK_LINKED})` : t === "KB_NOTED" ? `KB(${counts.KB_NOTED})` : `OR(${counts.ORPHANED})`}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {loading && <div style={{ color: "#6E8AA0", fontSize: 11, padding: 20, textAlign: "center" }}>Fetching datasets, tasks, knowledge…</div>}
            {error   && <div style={{ color: OR, fontSize: 11, padding: 20, textAlign: "center" }}>Error: {error}</div>}

            {!loading && visible.map((row) => {
              const meta = CLASS_META[row.cls];
              const isExp = expanded === row.id;
              return (
                <div
                  key={row.id}
                  style={{
                    borderBottom: "1px solid #0d2035",
                    padding:      "7px 0",
                    cursor:       "pointer",
                    background:   isExp ? "rgba(0,30,55,0.6)" : "transparent",
                    borderRadius: isExp ? 4 : 0,
                  }}
                  onClick={() => setExpanded(isExp ? null : row.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize:    9,
                      padding:     "1px 6px",
                      borderRadius: 3,
                      background:  `${meta.color}22`,
                      color:       meta.color,
                      fontWeight:  700,
                      whiteSpace:  "nowrap",
                      minWidth:    80,
                      textAlign:   "center",
                    }}>{meta.label}</span>
                    <span style={{ color: "#DCEBF5", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.name}
                    </span>
                    {row.type && (
                      <span style={{ fontSize: 9, color: "#6E8AA0", padding: "1px 5px", border: "1px solid #1E3A5F", borderRadius: 3 }}>{row.type}</span>
                    )}
                    {row.rowCount !== null && (
                      <span style={{ fontSize: 9, color: "#4ade80", padding: "1px 5px", border: "1px solid #1E3A5F", borderRadius: 3 }}>{row.rowCount} rows</span>
                    )}
                    <span style={{ fontSize: 9, color: "#6E8AA0", marginLeft: 4 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {row.description && (
                    <div style={{ fontSize: 10, color: "#6E8AA0", marginTop: 2, marginLeft: 88, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.description}
                    </div>
                  )}

                  {isExp && (
                    <div style={{ marginTop: 8, marginLeft: 8, padding: "8px", background: "#06182a", borderRadius: 4 }}>
                      {/* Matched tasks */}
                      <div style={{ fontSize: 10, color: TE, marginBottom: 4, fontWeight: 700 }}>
                        TASK LINKS ({row.matchedTasks.length})
                      </div>
                      {row.matchedTasks.length > 0 ? (
                        <div style={{ marginBottom: 8 }}>
                          {row.matchedTasks.slice(0, 3).map((t) => (
                            <div key={t.id} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "#DCEBF5" }}>{t.name}</span>
                                {t.status && (
                                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${TE}22`, color: TE }}>{t.status}</span>
                                )}
                              </div>
                              <div style={{ background: "#111827", borderRadius: 3, height: 3, marginTop: 2 }}>
                                <div style={{ width: `${Math.min(100, t.score * 14)}%`, height: "100%", background: TE, borderRadius: 3 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "#6E8AA0", marginBottom: 8 }}>No tasks matched for this dataset.</div>
                      )}

                      {/* Matched KB articles */}
                      <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 4, fontWeight: 700 }}>
                        KB ARTICLES ({row.matchedKb.length})
                      </div>
                      {row.matchedKb.length > 0 ? (
                        <div>
                          {row.matchedKb.slice(0, 3).map((k) => (
                            <div key={k.id} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "#DCEBF5" }}>{k.name}</span>
                                {k.category && (
                                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#a78bfa22", color: "#a78bfa" }}>{k.category}</span>
                                )}
                              </div>
                              <div style={{ background: "#111827", borderRadius: 3, height: 3, marginTop: 2 }}>
                                <div style={{ width: `${Math.min(100, k.score * 14)}%`, height: "100%", background: "#a78bfa", borderRadius: 3 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "#6E8AA0" }}>No KB articles matched for this dataset.</div>
                      )}

                      {row.cls === "ORPHANED" && (
                        <div style={{ fontSize: 11, color: OR, marginTop: 6 }}>
                          ⚠ ORPHANED — this dataset has no task or knowledge base coverage.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!loading && visible.length === 0 && !error && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 30 }}>
                No datasets match current filter.
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "5px 14px", borderTop: "1px solid #0d2035", display: "flex", justifyContent: "space-between", fontSize: 9, color: "#6E8AA0" }}>
            <span>AUTO-REFRESH {POLL_MS / 1000}s · {total} DATASETS · {lastPoll ? lastPoll.toLocaleTimeString() : "—"}</span>
            <span>{visible.length} SHOWN</span>
          </div>
        </div>
      )}
    </>
  );
}
