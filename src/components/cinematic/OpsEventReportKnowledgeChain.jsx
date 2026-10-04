/**
 * F170 — OpsEvent × Report × Knowledge — Evidence Chain (ORKEC)
 *
 * Parallel-fetches /v1/ops/events + /v1/reports + /knowledge/ every 90 s.
 * Keyword-correlates each ops event against the report archive AND the
 * knowledge base to classify operational intelligence coverage:
 *
 *   FULLY_EVIDENCED — event backed by ≥1 report AND ≥1 KB article
 *   REPORT_ONLY     — report coverage, no KB article
 *   KB_ONLY         — KB article coverage, no report
 *   DARK            — neither — undocumented operational event (intelligence gap)
 *
 * Stat tiles: events / reports / articles / evidenced / dark
 * Filter tabs: ALL | FULLY_EVIDENCED | REPORT_ONLY | KB_ONLY | DARK
 * Text search on event title/type.
 * Expand row → matched reports (amber bars) + matched KB articles (cyan bars).
 * Red badge + pulse on DARK count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence ops evidence brief + TTS.
 *
 * Toggle:  ◈ ORKEC  at bottom:8 left:965640, zIndex:670.
 * Event:   jarvis:orkec-toggle
 * Voice:   "orkec / ops evidence / ops evidence chain / event evidence /
 *           ops knowledge report / ops documentation / undocumented ops /
 *           dark ops event / ops coverage / operational evidence"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 965_640;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ────────────────────────────────────────────────────

const ORKEC_RE =
  /\b(orkec|ops\s+evidence\s+chain|ops\s+evidence|event\s+evidence|ops\s+knowledge\s+report|ops\s+documentation|undocumented\s+ops|dark\s+ops\s+event|ops\s+coverage|operational\s+evidence|ops\s+report\s+knowledge|event\s+coverage\s+chain)\b/i;

export function isOrkecQuery(q) { return ORKEC_RE.test(q || ""); }

export async function buildOrkecScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [evRes, rpRes, kbRes] = await Promise.all([
      fetch(`${base}/v1/ops/events`, { headers: hdr }),
      fetch(`${base}/v1/reports`,    { headers: hdr }),
      fetch(`${base}/knowledge/`,    { headers: hdr }),
    ]);
    const events   = normArr(await evRes.json(), ["events", "data", "items", "results"]);
    const reports  = normArr(await rpRes.json(), ["reports", "data", "items", "results"]);
    const articles = normaliseKb(await kbRes.json());

    const rows = classify(events, reports, articles);
    const dark = rows.filter((r) => r.cls === "DARK").length;
    const full = rows.filter((r) => r.cls === "FULLY_EVIDENCED").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS ops event evidence chain (ORKEC): ${events.length} operational events ` +
          `cross-referenced against ${reports.length} reports and ${articles.length} knowledge articles — ` +
          `${full} fully evidenced, ${dark} dark (no documentation). ` +
          `Give a 2-sentence operational intelligence coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    window.dispatchEvent(new CustomEvent("jarvis:orkec-toggle"));
    return (d.answer || "Operational evidence chain analysis complete, sir.").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:orkec-toggle"));
    return "Operational evidence chain analysis unavailable at this time, sir.";
  }
}

// ── Normalisers ────────────────────────────────────────────────────────────────

function normaliseKb(raw) {
  const arr = normArr(raw, ["articles", "knowledge", "docs", "documents", "data", "items", "results"]);
  return arr.map((a, i) => ({
    id:      a.id || a._id || a.slug || String(i),
    title:   a.title || a.name || a.label || a.subject || `Article ${i + 1}`,
    content: a.content || a.summary || a.body || a.description || "",
    tags:    Array.isArray(a.tags) ? a.tags : [],
  }));
}

function normArr(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of keys) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    for (const v of Object.values(raw)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function kw(obj) {
  return JSON.stringify(obj)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function score(eventKws, other) {
  const otherKws = new Set(kw(other));
  return eventKws.filter((w) => otherKws.has(w)).length;
}

function classify(events, reports, articles) {
  return events.map((ev, i) => {
    const evKws = kw(ev);
    const matchedReports = reports
      .map((r) => ({ ...r, score: score(evKws, r) }))
      .filter((r) => r.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const matchedArticles = articles
      .map((a) => ({ ...a, score: score(evKws, a) }))
      .filter((a) => a.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const hasReport  = matchedReports.length > 0;
    const hasArticle = matchedArticles.length > 0;
    const cls =
      hasReport && hasArticle ? "FULLY_EVIDENCED" :
      hasReport               ? "REPORT_ONLY" :
      hasArticle              ? "KB_ONLY" :
                                "DARK";

    return {
      id:    ev.id || ev._id || String(i),
      title: ev.title || ev.type || ev.event_type || ev.name || ev.label || `Event ${i + 1}`,
      ts:    ev.timestamp || ev.created_at || ev.date || "",
      severity: ev.severity || ev.level || "",
      cls,
      matchedReports,
      matchedArticles,
    };
  });
}

// ── Colour map ─────────────────────────────────────────────────────────────────

const CLS_COLOR = {
  FULLY_EVIDENCED: "#22D3EE",
  REPORT_ONLY:     "#F59E0B",
  KB_ONLY:         "#8B5CF6",
  DARK:            "#EF4444",
};
const CLS_LABEL = {
  FULLY_EVIDENCED: "FULLY EVIDENCED",
  REPORT_ONLY:     "REPORT ONLY",
  KB_ONLY:         "KB ONLY",
  DARK:            "DARK",
};

const TABS = ["ALL", "FULLY_EVIDENCED", "REPORT_ONLY", "KB_ONLY", "DARK"];

// ── Main component ─────────────────────────────────────────────────────────────

export default function OpsEventReportKnowledgeChain() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [reports, setReports]     = useState([]);
  const [articles, setArticles]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [evRes, rpRes, kbRes] = await Promise.all([
        fetch(`${base}/v1/ops/events`, { headers: hdr }),
        fetch(`${base}/v1/reports`,    { headers: hdr }),
        fetch(`${base}/knowledge/`,    { headers: hdr }),
      ]);
      const events   = normArr(await evRes.json(), ["events", "data", "items", "results"]);
      const rpArr    = normArr(await rpRes.json(), ["reports", "data", "items", "results"]);
      const kbArr    = normaliseKb(await kbRes.json());
      setReports(rpArr);
      setArticles(kbArr);
      setRows(classify(events, rpArr, kbArr));
    } catch {
      /* network unavailable — keep previous data */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:orkec-toggle", toggle);
    return () => window.removeEventListener("jarvis:orkec-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const darkCount     = rows.filter((r) => r.cls === "DARK").length;
  const evidencedCount = rows.filter((r) => r.cls === "FULLY_EVIDENCED").length;
  const reportOnlyCount = rows.filter((r) => r.cls === "REPORT_ONLY").length;
  const kbOnlyCount   = rows.filter((r) => r.cls === "KB_ONLY").length;

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `JARVIS ops event evidence chain (ORKEC): ${rows.length} events — ` +
            `${evidencedCount} fully evidenced, ${reportOnlyCount} report-only, ` +
            `${kbOnlyCount} KB-only, ${darkCount} dark (no documentation). ` +
            `Give a 2-sentence operational evidence coverage brief — formal British butler tone, first person.`,
        }),
      });
      const d = await r.json();
      const txt = (d.answer || "").trim();
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Assessment unavailable, sir.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      {/* ◈ ORKEC toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 670,
          background: open ? "#22D3EE22" : "#0B142088",
          border: `1px solid ${open ? "#22D3EE" : "#334155"}`,
          color: open ? "#22D3EE" : "#64748B",
          fontSize: 9,
          fontFamily: "monospace",
          padding: "3px 7px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: 1,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
        title="OpsEvent × Report × Knowledge — Evidence Chain"
      >
        {darkCount > 0 && (
          <span style={{
            background: "#EF4444",
            color: "#fff",
            borderRadius: "50%",
            fontSize: 8,
            fontWeight: 700,
            minWidth: 14,
            height: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "pulse 1.5s infinite",
          }}>
            {darkCount}
          </span>
        )}
        ◈ ORKEC
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 8000,
          width: 800,
          maxHeight: "82vh",
          overflowY: "auto",
          background: "linear-gradient(135deg,#060D1A 0%,#0A1628 100%)",
          border: "1px solid #22D3EE44",
          borderRadius: 12,
          boxShadow: "0 0 60px #22D3EE22",
          fontFamily: "monospace",
          color: "#CBD5E1",
        }}>
          {/* Header */}
          <div style={{
            padding: "16px 20px 12px",
            borderBottom: "1px solid #1E3050",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <span style={{ color: "#22D3EE", fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
                ◈ OPS EVENT EVIDENCE CHAIN
              </span>
              <span style={{ color: "#475569", fontSize: 10, marginLeft: 10 }}>
                OpsEvents × Reports × Knowledge
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#64748B", fontSize: 18, cursor: "pointer" }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "12px 20px" }}>
            {[
              { label: "EVENTS",    val: rows.length,          col: "#22D3EE" },
              { label: "REPORTS",   val: reports.length,       col: "#F59E0B" },
              { label: "KB ARTICLES", val: articles.length,    col: "#8B5CF6" },
              { label: "EVIDENCED", val: evidencedCount,       col: "#10B981" },
              { label: "DARK",      val: darkCount,            col: "#EF4444" },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1,
                background: "#0D1F35",
                border: `1px solid ${col}44`,
                borderRadius: 8,
                padding: "8px 10px",
                textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#475569", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 20px 8px" }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? "#22D3EE22" : "transparent",
                  border: `1px solid ${tab === t ? "#22D3EE" : "#1E3050"}`,
                  color: tab === t ? "#22D3EE" : "#475569",
                  fontSize: 8,
                  fontFamily: "monospace",
                  padding: "3px 8px",
                  borderRadius: 4,
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {t === "ALL" ? "ALL" : CLS_LABEL[t] || t}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 20px 10px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events…"
              style={{
                width: "100%",
                background: "#0D1F35",
                border: "1px solid #1E3050",
                borderRadius: 6,
                padding: "5px 10px",
                color: "#CBD5E1",
                fontSize: 11,
                fontFamily: "monospace",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Loading */}
          {loading && rows.length === 0 && (
            <div style={{ padding: "20px", textAlign: "center", color: "#475569", fontSize: 11 }}>
              Loading ops events…
            </div>
          )}

          {/* Rows */}
          <div style={{ padding: "0 20px 8px" }}>
            {visible.slice(0, 80).map((row) => {
              const col   = CLS_COLOR[row.cls];
              const isExp = expanded === row.id;
              return (
                <div key={row.id} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : row.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 10px",
                      background: "#0D1F3580",
                      border: `1px solid ${isExp ? col : "#1E3050"}`,
                      borderRadius: 6,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: col,
                      background: `${col}22`,
                      border: `1px solid ${col}44`,
                      borderRadius: 3,
                      padding: "1px 5px",
                      whiteSpace: "nowrap",
                      minWidth: 100,
                      textAlign: "center",
                    }}>
                      {CLS_LABEL[row.cls]}
                    </span>
                    <span style={{ flex: 1, fontSize: 11, color: "#CBD5E1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.title}
                    </span>
                    {row.severity && (
                      <span style={{
                        fontSize: 8,
                        color: row.severity === "critical" ? "#EF4444" : row.severity === "high" ? "#F59E0B" : "#64748B",
                        whiteSpace: "nowrap",
                        textTransform: "uppercase",
                        letterSpacing: 1,
                      }}>
                        {row.severity}
                      </span>
                    )}
                    {row.ts && (
                      <span style={{ fontSize: 8, color: "#475569", whiteSpace: "nowrap" }}>
                        {String(row.ts).slice(0, 10)}
                      </span>
                    )}
                    <span style={{ fontSize: 9, color: "#475569" }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{
                      background: "#06101E",
                      border: `1px solid ${col}44`,
                      borderTop: "none",
                      borderRadius: "0 0 6px 6px",
                      padding: "10px 12px",
                      display: "flex",
                      gap: 16,
                    }}>
                      {/* Matched reports */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#F59E0B", fontSize: 9, marginBottom: 6, letterSpacing: 1 }}>
                          ▸ MATCHED REPORTS ({row.matchedReports.length})
                        </div>
                        {row.matchedReports.length === 0 ? (
                          <div style={{ color: "#334155", fontSize: 10 }}>None</div>
                        ) : row.matchedReports.map((r, i) => (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#CBD5E1", marginBottom: 2 }}>
                              {r.title || r.name || r.label || `Report ${i + 1}`}
                            </div>
                            <div style={{ background: "#1E3050", borderRadius: 3, height: 4, overflow: "hidden" }}>
                              <div style={{
                                width: `${Math.min(100, (r.score / 10) * 100)}%`,
                                background: "#F59E0B",
                                height: "100%",
                              }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Matched KB articles */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#22D3EE", fontSize: 9, marginBottom: 6, letterSpacing: 1 }}>
                          ▸ MATCHED KB ARTICLES ({row.matchedArticles.length})
                        </div>
                        {row.matchedArticles.length === 0 ? (
                          <div style={{ color: "#334155", fontSize: 10 }}>None</div>
                        ) : row.matchedArticles.map((a, i) => (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#CBD5E1", marginBottom: 2 }}>
                              {a.title || `Article ${i + 1}`}
                            </div>
                            <div style={{ background: "#1E3050", borderRadius: 3, height: 4, overflow: "hidden" }}>
                              <div style={{
                                width: `${Math.min(100, (a.score / 10) * 100)}%`,
                                background: "#22D3EE",
                                height: "100%",
                              }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && !loading && (
              <div style={{ color: "#475569", fontSize: 11, textAlign: "center", padding: 20 }}>
                No events match the current filter.
              </div>
            )}
          </div>

          {/* Assess */}
          <div style={{ padding: "8px 20px 16px", borderTop: "1px solid #1E3050" }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "#1E3050" : "#22D3EE22",
                border: "1px solid #22D3EE55",
                color: assessing ? "#475569" : "#22D3EE",
                fontSize: 10,
                fontFamily: "monospace",
                padding: "5px 14px",
                borderRadius: 5,
                cursor: assessing ? "not-allowed" : "pointer",
                letterSpacing: 1,
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8,
                padding: "8px 10px",
                background: "#0D1F35",
                border: "1px solid #22D3EE33",
                borderRadius: 6,
                color: "#CBD5E1",
                fontSize: 11,
                lineHeight: 1.5,
              }}>
                {assessment}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
