/**
 * ReportKnowledgeCoverage — F41.
 *
 * Cross-references /v1/reports + /knowledge/ to surface which reports
 * have no backing knowledge article, and which knowledge articles have
 * no linked report. Shows a coverage matrix with actionable gaps.
 *
 * Data sources (confirmed-real endpoints):
 *   GET  /v1/reports      → {reports:[{id,title,category,created_at,...}]}
 *   GET  /knowledge/      → {articles:[{id,title,tags,...}]} or array
 *   POST /v1/jarvis/agent/chat   → AI assessment + TTS
 *
 * Stat tiles: total reports / backed / unbacked / knowledge articles
 * REPORTS tab: list with backed/unbacked chip
 * KNOWLEDGE tab: list with linked/unlinked chip
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 *
 * Toggle: ◈ RKCOV at left:192000, bottom:8, zIndex:72.
 * Badge: green = coverage %, amber when coverage < 50%.
 *
 * Exported helpers for JarvisBrain:
 *   isRkcovQuery(q) / buildRkcovScript()
 *
 * Voice triggers: "report coverage / knowledge coverage / report gaps /
 *   rkcov / uncovered reports / report knowledge gap / knowledge backing /
 *   report knowledge coverage"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const GREEN = "#00C878";
const AMBER = "#F5A623";
const RED   = "#FF3B3B";
const GRAY  = "#4E6070";

const BTN_LEFT   = 192000;
const REFRESH_MS = 120_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const RKCOV_RE =
  /\b(report.?coverage|knowledge.?coverage|report.?gaps?|rkcov|uncovered.?reports?|report.?knowledge.?gap|knowledge.?backing|report.?knowledge.?coverage|coverage.?matrix|backing.?knowledge)\b/i;

export function isRkcovQuery(q) { return RKCOV_RE.test(q || ""); }

export async function buildRkcovScript() {
  try {
    const base = apiBase();
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [rr, kr] = await Promise.all([
      fetch(`${base}/v1/reports`, { headers: hdrs }).then(r => r.json()).catch(() => ({})),
      fetch(`${base}/knowledge/`, { headers: hdrs }).then(r => r.json()).catch(() => ({})),
    ]);
    const reports  = norm(rr);
    const articles = norm(kr);
    const backed   = reports.filter(r => isLinked(r, articles)).length;
    const pct      = reports.length ? Math.round((backed / reports.length) * 100) : 0;
    return `Report Knowledge Coverage: ${reports.length} reports, ${articles.length} knowledge articles. ` +
      `${backed} reports (${pct}%) have backing knowledge articles. ` +
      `${reports.length - backed} reports lack knowledge backing — prioritize those for knowledge capture.`;
  } catch {
    return "Report knowledge coverage data unavailable.";
  }
}

function norm(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["reports", "articles", "items", "results", "data"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function titleTokens(item) {
  const t = (item.title || item.name || item.label || "").toLowerCase();
  return t.split(/[\s,;:_-]+/).filter(w => w.length > 3);
}

function isLinked(report, articles) {
  const rtoks = titleTokens(report);
  return articles.some(a => {
    const atoks = titleTokens(a);
    return rtoks.some(rt => atoks.includes(rt));
  });
}

const MONO = "'JetBrains Mono', 'Courier New', monospace";
const PILL = (col) => ({
  display: "inline-block", padding: "1px 7px", borderRadius: 9,
  fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
  background: `${col}22`, color: col, marginRight: 4,
});
const TILE = {
  flex: "1 1 90px", background: "rgba(255,255,255,0.04)",
  borderRadius: 8, padding: "10px 14px", textAlign: "center",
};
const ROW = {
  padding: "7px 12px", borderBottom: "1px solid rgba(41,231,255,0.08)",
  cursor: "default",
};

export default function ReportKnowledgeCoverage() {
  const [open, setOpen]     = useState(false);
  const [tab, setTab]       = useState("reports");
  const [reports, setReports]     = useState([]);
  const [articles, setArticles]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [rr, kr] = await Promise.all([
        fetch(`${base}/v1/reports`, { headers: hdrs }).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/knowledge/`, { headers: hdrs }).then(r => r.json()).catch(() => ({})),
      ]);
      setReports(norm(rr));
      setArticles(norm(kr));
    } catch (_) { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:rkcov-toggle", toggle);
    return () => window.removeEventListener("jarvis:rkcov-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  // JarvisBrain jarvis:ask integration
  useEffect(() => {
    const h = (e) => {
      if (isRkcovQuery(e?.detail?.query)) {
        setOpen(true);
      }
    };
    window.addEventListener("jarvis:ask", h);
    return () => window.removeEventListener("jarvis:ask", h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const script = await buildRkcovScript();
      const base = apiBase();
      const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ message: script }),
      }).then(r => r.json()).catch(() => ({}));
      const text = r.response || r.message || r.content || script;
      setAssessment(text);
      // TTS
      fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ text, voice: "ash" }),
      }).catch(() => {});
    } catch (_) { setAssessment("Assessment unavailable."); }
    setAssessing(false);
  }, []);

  const backed   = reports.filter(r => isLinked(r, articles));
  const unbacked = reports.filter(r => !isLinked(r, articles));
  const linked   = articles.filter(a => reports.some(r => isLinked(r, [a])));
  const unlinked = articles.filter(a => !reports.some(r => isLinked(r, [a])));
  const pct      = reports.length ? Math.round((backed.length / reports.length) * 100) : 0;
  const badgeCol = pct >= 50 ? GREEN : AMBER;

  const tabItems = tab === "reports"
    ? reports.map(r => ({ item: r, ok: isLinked(r, articles) }))
    : articles.map(a => ({ item: a, ok: reports.some(r => isLinked(r, [a])) }));

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Report Knowledge Coverage (F41)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 72,
          background: open ? `${CY}18` : "rgba(5,12,20,0.75)",
          border: `1px solid ${open ? CY : `${CY}33`}`,
          color: CY, fontFamily: MONO, fontSize: 9, letterSpacing: 1.2,
          padding: "4px 8px", borderRadius: 6, cursor: "pointer",
          backdropFilter: "blur(6px)", whiteSpace: "nowrap",
        }}
      >
        ◈ RKCOV
        {reports.length > 0 && (
          <span style={{
            marginLeft: 4, background: `${badgeCol}33`,
            color: badgeCol, borderRadius: 8, padding: "0 5px",
            fontSize: 9, fontWeight: 700,
          }}>
            {pct}%
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 38, left: BTN_LEFT - 200, zIndex: 1300,
          width: 480, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(4,8,16,0.97)", border: `1px solid ${CY}44`,
          borderRadius: 12, fontFamily: MONO,
          boxShadow: `0 0 60px ${CY}18, 0 24px 48px rgba(0,0,0,0.8)`,
        }}>
          {/* Header */}
          <div style={{
            borderBottom: `1px solid ${CY}22`, padding: "10px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 1.5 }}>
              REPORT KNOWLEDGE COVERAGE
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px" }}>
            {[
              { label: "REPORTS",    val: reports.length,  col: CY },
              { label: "BACKED",     val: backed.length,   col: GREEN },
              { label: "UNBACKED",   val: unbacked.length, col: unbacked.length > 0 ? AMBER : GREEN },
              { label: "KNOWLEDGE",  val: articles.length, col: CY },
            ].map(({ label, val, col }) => (
              <div key={label} style={TILE}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: GRAY, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 8, padding: "0 14px 8px" }}>
            {["reports", "knowledge"].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}18` : "transparent",
                  border: `1px solid ${tab === t ? CY : `${CY}33`}`,
                  color: tab === t ? CY : GRAY,
                  borderRadius: 5, padding: "3px 10px",
                  fontSize: 9, letterSpacing: 1, cursor: "pointer",
                  fontFamily: MONO, textTransform: "uppercase",
                }}
              >
                {t === "reports"
                  ? `REPORTS (${reports.length})`
                  : `KNOWLEDGE (${articles.length})`}
              </button>
            ))}
          </div>

          {/* List */}
          <div style={{ maxHeight: 280, overflowY: "auto", padding: "0 0 4px" }}>
            {loading && (
              <div style={{ color: GRAY, fontSize: 11, textAlign: "center", padding: 20 }}>
                Loading…
              </div>
            )}
            {!loading && tabItems.length === 0 && (
              <div style={{ color: GRAY, fontSize: 11, textAlign: "center", padding: 20 }}>
                No data
              </div>
            )}
            {!loading && tabItems.map(({ item, ok }, i) => (
              <div key={item.id || i} style={ROW}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={PILL(ok ? GREEN : AMBER)}>
                    {ok ? "BACKED" : "UNBACKED"}
                  </span>
                  <span style={{ color: ok ? "#DCEBF5" : "#7A95AB", fontSize: 11 }}>
                    {item.title || item.name || item.id || "—"}
                  </span>
                </div>
                {item.category && (
                  <div style={{ color: GRAY, fontSize: 10, marginTop: 2, paddingLeft: 4 }}>
                    {item.category}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ASSESS */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${CY}22` }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: `${CY}18`, border: `1px solid ${CY}55`,
                color: CY, borderRadius: 6, padding: "4px 12px",
                fontSize: 10, letterSpacing: 1, cursor: "pointer", fontFamily: MONO,
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8, color: "#DCEBF5", fontSize: 11,
                lineHeight: 1.6, padding: "8px", background: `${CY}08`,
                borderRadius: 6, border: `1px solid ${CY}22`,
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
