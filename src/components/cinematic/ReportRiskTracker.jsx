/**
 * F161 — Report × Risk Signal Coverage
 *
 * Parallel-fetches /v1/reports + /entities/RiskSignal, then keyword-
 * correlates each report (title/summary/tags) against active risk signals
 * (title/description/tags/severity) to surface:
 *   EXPOSED — report topic overlaps with at least one live risk signal
 *   CLEAR   — report topic has no correlated active risk signals
 *
 * Stat tiles: reports / signals / exposed / clear
 * Filter tabs: ALL | EXPOSED | CLEAR
 * Expand any report → matched risk signals with severity badge + relevance score.
 * Red badge on exposed count.
 * ▶ ASSESS: 2-sentence report-risk coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RRISK  at bottom:8 left:52280, zIndex:104.
 * Event:   jarvis:rrisk-toggle
 * Voice:   "report risk / risk reports / rrisk / covered risks / report signals / report threat"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 52280;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const RRISK_RE =
  /\b(report\s+risk|risk\s+reports?|rrisk|covered\s+risks?|report\s+signals?|report\s+threat|which\s+reports?\s+(cover|map|match|overlap|have)\s+(risk|threat|signal)|reports?\s+vs\s+risk)\b/i;

export function isRriskQuery(q) { return RRISK_RE.test(q); }

export async function buildRriskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [repRes, sigRes] = await Promise.all([
      fetch(`${base}/v1/reports`,          { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
    ]);
    const reports = normaliseReports(await repRes.json());
    const signals = normaliseSignals(await sigRes.json());

    const exposed = reports.filter((r) => signals.some((s) => relevance(r, s) > 0)).length;
    const clear   = reports.length - exposed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS report × risk signal coverage: ${reports.length} reports, ` +
          `${signals.length} active risk signals, ${exposed} reports overlap with live threats, ` +
          `${clear} reports have no correlated risk signals. ` +
          `Give a 2-sentence report-risk coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Report risk coverage analysis complete, sir.").trim();
  } catch {
    return "Report risk coverage analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseReports(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.reports)           ? raw.reports
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.items)             ? raw.items
    : Array.isArray(raw?.results)           ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:      r.id       || r.report_id   || String(i),
    title:   r.title    || r.name        || r.subject || `Report ${i + 1}`,
    summary: (r.summary || r.description || r.abstract || r.content || "").toString(),
    type:    r.type     || r.category    || r.report_type || "",
    date:    r.date     || r.created_at  || r.published_at || "",
    tags:    Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
  }));
}

function normaliseSignals(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.signals)           ? raw.signals
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.items)             ? raw.items
    : Array.isArray(raw?.results)           ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || String(i),
    title:       s.title       || s.name        || s.signal_name || `Signal ${i + 1}`,
    description: (s.description || s.summary    || s.details || "").toString(),
    severity:    s.severity    || s.level       || s.priority || s.risk_level || "",
    type:        s.type        || s.signal_type || s.category  || "",
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(report, signal) {
  const rw = keywords(`${report.title} ${report.summary.slice(0, 300)} ${report.tags}`);
  const sw = keywords(`${signal.title} ${signal.description.slice(0, 300)} ${signal.tags}`);
  return rw.filter((w) => sw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildLinked(reports, signals) {
  return reports.map((r) => {
    const matched = signals
      .map((s) => ({ ...s, score: relevance(r, s) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...r, signals: matched, exposed: matched.length > 0 };
  });
}

const SEV_COLOR = {
  critical: "#EF4444",
  high:     "#F97316",
  medium:   "#F59E0B",
  low:      "#4ADE80",
};
function sevColor(sev) {
  return SEV_COLOR[(sev || "").toLowerCase()] || "#60A5FA";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "EXPOSED", "CLEAR"];

export default function ReportRiskTracker() {
  const [open,      setOpen]      = useState(false);
  const [reports,   setReports]   = useState([]);
  const [signals,   setSignals]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [repRes, sigRes] = await Promise.all([
        fetch(`${base}/v1/reports`,          { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      setReports(normaliseReports(await repRes.json()));
      setSignals(normaliseSignals(await sigRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:rrisk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rrisk-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isRriskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked  = buildLinked(reports, signals);
  const exposed = linked.filter((r) => r.exposed).length;
  const clear   = linked.filter((r) => !r.exposed).length;

  const visible = linked
    .filter((r) => {
      if (filter === "EXPOSED") return r.exposed;
      if (filter === "CLEAR")   return !r.exposed;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)  ||
        r.summary.toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    const text = await buildRriskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Report × Risk Signal Coverage (◈ RRISK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 104,
          background: open ? "rgba(239,68,68,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? "#EF4444" : S.border}`,
          borderRadius: S.radius, color: open ? "#EF4444" : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? "0 0 8px #EF444444" : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ RRISK{exposed > 0 && (
          <span style={{
            marginLeft: 4,
            background: "#EF4444",
            color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{exposed}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 103,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: "2px solid #EF4444",
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "70vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: "#EF4444", letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
              REPORT — RISK SIGNAL COVERAGE
            </span>
            <button
              onClick={assess}
              disabled={assessing || reports.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || reports.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "REPORTS",  val: reports.length, color: C.blue    },
              { label: "SIGNALS",  val: signals.length, color: C.neon    },
              { label: "EXPOSED",  val: exposed,        color: "#EF4444" },
              { label: "CLEAR",    val: clear,          color: "#4ADE80" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 4px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1,
                background: filter === t ? "rgba(239,68,68,0.13)" : "transparent",
                border: `1px solid ${filter === t ? "#EF4444" : S.border}`,
                color: filter === t ? "#EF4444" : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search reports…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)",
                border: `1px solid ${S.border}`, borderRadius: S.radius,
                color: S.textHi, fontFamily: S.mono, fontSize: "9px",
                padding: "3px 7px", outline: "none",
              }}
            />
          </div>

          {/* Report list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && reports.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No reports match.</div>
            ) : visible.map((r) => (
              <div key={r.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${r.exposed ? "#EF4444" : "#4ADE80"}`,
                  }}
                >
                  <span style={{ color: r.exposed ? "#EF4444" : "#4ADE80", fontSize: 10, width: 10 }}>
                    {r.exposed ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.title}
                  </span>
                  {r.type && (
                    <span style={{
                      fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                      color: C.blue, border: `1px solid ${C.blue}55`,
                      background: `${C.blue}11`, whiteSpace: "nowrap",
                    }}>
                      {r.type}
                    </span>
                  )}
                  <span style={{
                    fontSize: "9px", whiteSpace: "nowrap",
                    color: r.exposed ? "#EF4444" : "#4ADE80",
                    minWidth: 50, textAlign: "right",
                  }}>
                    {r.exposed ? `${r.signals.length} SIG` : "CLEAR"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === r.id ? "▴" : "▾"}</span>
                </div>

                {expanded === r.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {r.summary && (
                      <div style={{
                        color: S.text, fontSize: "8px", marginBottom: 4,
                        overflow: "hidden", display: "-webkit-box",
                        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>
                        {r.summary.slice(0, 120)}{r.summary.length > 120 ? "…" : ""}
                      </div>
                    )}
                    {r.exposed ? r.signals.map((s) => (
                      <div key={s.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}22`,
                      }}>
                        {s.severity && (
                          <span style={{
                            fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                            background: `${sevColor(s.severity)}22`,
                            color: sevColor(s.severity),
                            border: `1px solid ${sevColor(s.severity)}44`,
                            whiteSpace: "nowrap", textTransform: "uppercase",
                          }}>
                            {s.severity}
                          </span>
                        )}
                        <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.title}
                        </span>
                        <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                          rel:{s.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: "#4ADE80", fontSize: "9px", padding: "2px 0" }}>
                        No active risk signals correlated with this report.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /v1/reports · /entities/RiskSignal · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
