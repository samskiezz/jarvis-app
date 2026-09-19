/**
 * F39 — Task × Investigation × Knowledge Coverage (TIKC)
 * Endpoints: /entities/Task × /v1/investigations × /knowledge/
 * Classification: FULLY_BACKED | INVESTIGATED | DOCUMENTED | ORPHAN
 * Identifies tasks that lack both investigation backing and knowledge documentation.
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 931_540;
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

const TIKC_RE =
  /\b(tikc|task\s*investigation\s*knowledge|task\s*coverage|task\s*backing|task\s*documentation|orphan\s*task|unbacked\s*task|task\s*knowledge|task\s*intel|mission\s*coverage|mission\s*backing|task\s*investigation|task\s*research|mission\s*knowledge)\b/i;

export function isTikcQuery(t) {
  return TIKC_RE.test(t || "");
}

// ── Normalisers ───────────────────────────────────────────────────────────────

function normaliseTask(raw) {
  if (!raw) return null;
  return {
    id:       raw.id || raw.task_id || raw._id || String(Math.random()),
    title:    raw.title || raw.name || raw.label || raw.description || "Unnamed Task",
    status:   raw.status || raw.state || "",
    priority: raw.priority || raw.urgency || "",
    tags:     Array.isArray(raw.tags) ? raw.tags : [],
    extra:    raw,
  };
}

function normaliseInvestigation(raw) {
  if (!raw) return null;
  return {
    id:     raw.id || raw.investigation_id || raw._id || String(Math.random()),
    title:  raw.title || raw.name || raw.label || raw.subject || "Unnamed Investigation",
    status: raw.status || raw.state || "",
    type:   raw.type || raw.category || raw.investigation_type || "",
    tags:   Array.isArray(raw.tags) ? raw.tags : [],
    extra:  raw,
  };
}

function normaliseKnowledge(raw) {
  if (!raw) return null;
  return {
    id:    raw.id || raw.article_id || raw._id || String(Math.random()),
    title: raw.title || raw.name || raw.label || raw.subject || "Unnamed Article",
    type:  raw.type || raw.category || raw.content_type || "",
    tags:  Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

// ── Keyword scoring ───────────────────────────────────────────────────────────

function keywords(obj) {
  const txt = JSON.stringify(obj || "").toLowerCase();
  return txt.match(/[a-z]{4,}/g) || [];
}

function scoreMatch(aKw, bKw) {
  const setB = new Set(bKw);
  return aKw.filter((w) => w.length > 3 && setB.has(w)).length;
}

// ── Classification ─────────────────────────────────────────────────────────────

const CLASS_META = {
  FULLY_BACKED: {
    label: "FULLY BACKED",
    color: "#00ff88",
    desc:  "Task linked to both an Investigation AND a Knowledge article",
  },
  INVESTIGATED: {
    label: "INVESTIGATED",
    color: "#29e7ff",
    desc:  "Task linked to Investigation but no Knowledge documentation",
  },
  DOCUMENTED: {
    label: "DOCUMENTED",
    color: "#ffaa00",
    desc:  "Task linked to Knowledge article but no active Investigation",
  },
  ORPHAN: {
    label: "ORPHAN",
    color: "#ff3333",
    desc:  "Task with no Investigation or Knowledge backing — flying blind",
  },
};

function buildMatrix(tasks, investigations, knowledge) {
  return tasks.map((task) => {
    const tKw = keywords(task);

    let bestInv      = null;
    let bestInvScore = 0;
    for (const inv of investigations) {
      const s = scoreMatch(tKw, keywords(inv));
      if (s > bestInvScore) { bestInvScore = s; bestInv = inv; }
    }

    let bestKnow      = null;
    let bestKnowScore = 0;
    for (const k of knowledge) {
      const s = scoreMatch(tKw, keywords(k));
      if (s > bestKnowScore) { bestKnowScore = s; bestKnow = k; }
    }

    const hasInv  = bestInv  && bestInvScore  > 0;
    const hasKnow = bestKnow && bestKnowScore > 0;

    const cls =
      hasInv && hasKnow ? "FULLY_BACKED"
      : hasInv          ? "INVESTIGATED"
      : hasKnow         ? "DOCUMENTED"
                        : "ORPHAN";

    return {
      task, inv: hasInv ? bestInv : null, invScore: bestInvScore,
      know: hasKnow ? bestKnow : null, knowScore: bestKnowScore, cls,
    };
  });
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };

  const [tRaw, iRaw, kRaw] = await Promise.all([
    fetch(`${base}/entities/Task`,    { headers: hdr }).then((r) => r.ok ? r.json() : []),
    fetch(`${base}/v1/investigations`,{ headers: hdr }).then((r) => r.ok ? r.json() : []),
    fetch(`${base}/knowledge/`,       { headers: hdr }).then((r) => r.ok ? r.json() : []),
  ]);

  const tasks = (Array.isArray(tRaw) ? tRaw : tRaw?.data ?? tRaw?.tasks ?? [])
    .map(normaliseTask).filter(Boolean);
  const investigations = (Array.isArray(iRaw) ? iRaw : iRaw?.data ?? iRaw?.investigations ?? [])
    .map(normaliseInvestigation).filter(Boolean);
  const knowledge = (Array.isArray(kRaw) ? kRaw : kRaw?.data ?? kRaw?.articles ?? kRaw?.items ?? [])
    .map(normaliseKnowledge).filter(Boolean);

  return { tasks, investigations, knowledge };
}

export async function buildTikcScript() {
  try {
    const { tasks, investigations, knowledge } = await fetchAll();
    const rows   = buildMatrix(tasks, investigations, knowledge);
    const counts = {
      FULLY_BACKED:  rows.filter((r) => r.cls === "FULLY_BACKED").length,
      INVESTIGATED:  rows.filter((r) => r.cls === "INVESTIGATED").length,
      DOCUMENTED:    rows.filter((r) => r.cls === "DOCUMENTED").length,
      ORPHAN:        rows.filter((r) => r.cls === "ORPHAN").length,
    };
    return (
      `Task Investigation-Knowledge Coverage: ${tasks.length} tasks cross-referenced against ` +
      `${investigations.length} investigations and ${knowledge.length} knowledge articles. ` +
      `Fully backed (investigation + knowledge): ${counts.FULLY_BACKED}. ` +
      `Investigation only: ${counts.INVESTIGATED}. ` +
      `Knowledge only: ${counts.DOCUMENTED}. ` +
      `Orphan (no backing): ${counts.ORPHAN} — tasks operating without research or documentation.`
    );
  } catch (e) {
    return `Task Investigation-Knowledge Coverage unavailable: ${e.message}`;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TaskInvestigationKnowledge() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [counts,   setCounts]   = useState({ FULLY_BACKED: 0, INVESTIGATED: 0, DOCUMENTED: 0, ORPHAN: 0 });
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState(null);
  const [filter,   setFilter]   = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      setOpen((v) => (e.detail?.force !== undefined ? e.detail.force : !v));
    }
    window.addEventListener("jarvis:tikc-toggle", handler);
    return () => window.removeEventListener("jarvis:tikc-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    async function load() {
      setLoading(true); setErr(null);
      try {
        const { tasks, investigations, knowledge } = await fetchAll();
        const matrix = buildMatrix(tasks, investigations, knowledge);
        setRows(matrix);
        setCounts({
          FULLY_BACKED:  matrix.filter((r) => r.cls === "FULLY_BACKED").length,
          INVESTIGATED:  matrix.filter((r) => r.cls === "INVESTIGATED").length,
          DOCUMENTED:    matrix.filter((r) => r.cls === "DOCUMENTED").length,
          ORPHAN:        matrix.filter((r) => r.cls === "ORPHAN").length,
        });
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
    intervalRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [open]);

  const visible = rows.filter((r) => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.task.title.toLowerCase().includes(q) ||
        r.task.status.toLowerCase().includes(q) ||
        (r.inv?.title  || "").toLowerCase().includes(q) ||
        (r.know?.title || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const orphanBadge = counts.ORPHAN;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position:    "fixed",
          bottom:      8,
          left:        BTN_LEFT,
          zIndex:      627,
          fontFamily:  "monospace",
          fontSize:    10,
          padding:     "2px 7px",
          background:  open ? "#080f08" : "#0a0a0a",
          color:       open ? "#00ff88" : "#555",
          border:      `1px solid ${open ? "#00ff88" : "#333"}`,
          borderRadius: 3,
          cursor:      "pointer",
          whiteSpace:  "nowrap",
          animation:   orphanBadge > 0 ? "jarvisPulse 2s infinite" : "none",
        }}
        title="Task × Investigation × Knowledge Coverage"
      >
        TIKC{orphanBadge > 0 ? ` [${orphanBadge}]` : ""}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position:      "fixed",
            bottom:        36,
            left:          BTN_LEFT - 200,
            width:         920,
            maxHeight:     580,
            zIndex:        627,
            background:    "#080f08",
            border:        "1px solid #00ff88",
            borderRadius:  6,
            fontFamily:    "monospace",
            fontSize:      11,
            color:         "#ccc",
            display:       "flex",
            flexDirection: "column",
            overflow:      "hidden",
            boxShadow:     "0 0 24px #00ff8844",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding:      "6px 12px",
              borderBottom: "1px solid #00ff8844",
              display:      "flex",
              alignItems:   "center",
              gap:          8,
              flexShrink:   0,
            }}
          >
            <span style={{ color: "#00ff88", fontWeight: "bold", fontSize: 12 }}>TIKC</span>
            <span style={{ color: "#555", fontSize: 10 }}>
              Task × Investigation × Knowledge Coverage
            </span>
            {loading && (
              <span style={{ color: "#00ff88", marginLeft: "auto", fontSize: 10 }}>LOADING…</span>
            )}
            {err && (
              <span style={{ color: "#f55", marginLeft: "auto", fontSize: 10 }}>ERR: {err}</span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display:      "flex",
              gap:          6,
              padding:      "6px 12px",
              flexShrink:   0,
              borderBottom: "1px solid #00ff8822",
            }}
          >
            {Object.entries(CLASS_META).map(([k, meta]) => (
              <div
                key={k}
                onClick={() => setFilter(filter === k ? "ALL" : k)}
                style={{
                  flex:         1,
                  background:   filter === k ? "#0d1a0d" : "#111",
                  border:       `1px solid ${filter === k ? meta.color : "#333"}`,
                  borderRadius: 4,
                  padding:      "4px 6px",
                  cursor:       "pointer",
                  textAlign:    "center",
                }}
              >
                <div style={{ color: meta.color, fontSize: 16, fontWeight: "bold" }}>{counts[k]}</div>
                <div style={{ color: "#666", fontSize: 9 }}>{meta.label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div
            style={{
              padding:      "4px 12px",
              flexShrink:   0,
              display:      "flex",
              gap:          8,
              alignItems:   "center",
              borderBottom: "1px solid #00ff8822",
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search tasks / investigations / knowledge…"
              style={{
                flex:         1,
                background:   "#111",
                border:       "1px solid #333",
                borderRadius: 3,
                color:        "#ccc",
                fontFamily:   "monospace",
                fontSize:     10,
                padding:      "2px 6px",
              }}
            />
            <span style={{ color: "#555", fontSize: 10 }}>{visible.length}/{rows.length}</span>
          </div>

          {/* Rows */}
          <div style={{ overflow: "auto", flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: 16, color: "#444", textAlign: "center" }}>
                {err ? "Error loading data." : "No tasks match."}
              </div>
            )}
            {visible.map((row, i) => {
              const meta       = CLASS_META[row.cls];
              const isExpanded = expanded === (row.task.id + i);
              return (
                <div key={row.task.id + i} style={{ borderBottom: "1px solid #0d1a0d" }}>
                  {/* Row summary */}
                  <div
                    onClick={() => setExpanded(isExpanded ? null : row.task.id + i)}
                    style={{
                      padding:             "5px 12px",
                      display:             "grid",
                      gridTemplateColumns: "120px 1fr 1fr 1fr",
                      gap:                 6,
                      alignItems:          "start",
                      cursor:              "pointer",
                    }}
                  >
                    {/* Badge */}
                    <div>
                      <span
                        style={{
                          display:      "inline-block",
                          padding:      "1px 4px",
                          borderRadius: 2,
                          background:   "#080f08",
                          border:       `1px solid ${meta.color}`,
                          color:        meta.color,
                          fontSize:     9,
                          whiteSpace:   "nowrap",
                        }}
                      >
                        {meta.label}
                      </span>
                      {row.task.priority && (
                        <div style={{ color: "#555", fontSize: 9, marginTop: 2 }}>P:{row.task.priority}</div>
                      )}
                    </div>

                    {/* Task */}
                    <div>
                      <div style={{ color: "#29e7ff", fontSize: 10, fontWeight: "bold" }}>
                        {row.task.title}
                      </div>
                      {row.task.status && (
                        <div style={{ color: "#555", fontSize: 9 }}>{row.task.status}</div>
                      )}
                    </div>

                    {/* Investigation */}
                    <div>
                      {row.inv ? (
                        <>
                          <div style={{ color: "#ff9933", fontSize: 10 }}>{row.inv.title}</div>
                          <div style={{ color: "#555", fontSize: 9 }}>
                            inv · score {row.invScore}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: "#333", fontSize: 10 }}>— no investigation</div>
                      )}
                    </div>

                    {/* Knowledge */}
                    <div>
                      {row.know ? (
                        <>
                          <div style={{ color: "#ffaa00", fontSize: 10 }}>{row.know.title}</div>
                          <div style={{ color: "#555", fontSize: 9 }}>
                            kb · score {row.knowScore}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: "#333", fontSize: 10 }}>— no knowledge article</div>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      style={{
                        padding:    "6px 12px 8px",
                        background: "#0c150c",
                        display:    "flex",
                        gap:        12,
                      }}
                    >
                      {/* Investigation bar */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#ff9933", fontSize: 9, marginBottom: 3 }}>INVESTIGATION</div>
                        {row.inv ? (
                          <>
                            <div style={{ height: 6, borderRadius: 2, background: "#1a1200", overflow: "hidden", marginBottom: 3 }}>
                              <div style={{ width: `${Math.min(100, row.invScore * 10)}%`, height: "100%", background: "#ff9933" }} />
                            </div>
                            <div style={{ color: "#777", fontSize: 9 }}>
                              {row.inv.title}
                              {row.inv.status ? ` · ${row.inv.status}` : ""}
                              {row.inv.type   ? ` · ${row.inv.type}` : ""}
                            </div>
                          </>
                        ) : (
                          <div style={{ color: "#333", fontSize: 9 }}>no matching investigation</div>
                        )}
                      </div>

                      {/* Knowledge bar */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#ffaa00", fontSize: 9, marginBottom: 3 }}>KNOWLEDGE</div>
                        {row.know ? (
                          <>
                            <div style={{ height: 6, borderRadius: 2, background: "#1a1400", overflow: "hidden", marginBottom: 3 }}>
                              <div style={{ width: `${Math.min(100, row.knowScore * 10)}%`, height: "100%", background: "#ffaa00" }} />
                            </div>
                            <div style={{ color: "#777", fontSize: 9 }}>
                              {row.know.title}
                              {row.know.type ? ` · ${row.know.type}` : ""}
                            </div>
                          </>
                        ) : (
                          <div style={{ color: "#333", fontSize: 9 }}>no matching knowledge article</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer / ASSESS */}
          <div
            style={{
              padding:        "4px 12px",
              borderTop:      "1px solid #00ff8822",
              color:          "#444",
              fontSize:       9,
              flexShrink:     0,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
            }}
          >
            <span>/entities/Task × /v1/investigations × /knowledge/ · poll {POLL_MS / 1000}s</span>
            <button
              onClick={async () => {
                try {
                  const script = await buildTikcScript();
                  const base   = apiBase();
                  const resp   = await fetch(`${base}/v1/jarvis/agent/chat`, {
                    method:  "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
                    body:    JSON.stringify({ message: script }),
                  });
                  if (resp.ok) {
                    const data = await resp.json();
                    const text =
                      data.response || data.message || data.content ||
                      (typeof data === "string" ? data : JSON.stringify(data));
                    window.dispatchEvent(new CustomEvent("jarvis:speak", { detail: { text } }));
                  }
                } catch (_) {}
              }}
              style={{
                background:   "#0d1a0d",
                border:       "1px solid #00ff88",
                color:        "#00ff88",
                fontFamily:   "monospace",
                fontSize:     9,
                padding:      "2px 8px",
                borderRadius: 2,
                cursor:       "pointer",
              }}
            >
              ▶ ASSESS
            </button>
          </div>
        </div>
      )}
    </>
  );
}
