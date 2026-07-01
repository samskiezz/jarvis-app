/**
 * F89 — Report × Risk Signal Correlator
 *
 * Parallel-fetches /v1/reports + /entities/RiskSignal, then keyword-correlates
 * each risk signal (title/description/type/tags) against report titles and
 * content to surface whether a signal is DOCUMENTED (at least one report
 * references it) or UNDOCUMENTED (no reporting found — an intelligence gap).
 *
 * Stat tiles: reports / signals / documented / undocumented.
 * Filter tabs: ALL | DOCUMENTED | UNDOCUMENTED + text search.
 * Expand any signal → matched reports with type badge + relevance score.
 * Amber badge on undocumented count (intelligence gap indicator).
 * ▶ ASSESS: /v1/jarvis/agent/chat 2-sentence risk-documentation brief
 *   + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RPRSK  at bottom:8 left:23360, zIndex 69.
 * Voice:   "report risk / risk reporting gap / which risks have reports /
 *           risk documentation / undocumented risks / rprsk"
 * Event:   jarvis:rprsk-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 23360;
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

// ── exported intent helpers ──────────────────────────────────────────────────

const RPRSK_RE =
  /\b(report\s+risk|risk\s+report(?:ing)?(?:\s+gap)?|which\s+risks?\s+(have\s+)?reports?|risk\s+documentation|undocumented\s+risks?|rprsk)\b/i;

export function isRprskQuery(q) { return RPRSK_RE.test(q); }

export async function buildRprskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [rRes, sRes] = await Promise.all([
      fetch(`${base}/v1/reports`,         { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
    ]);
    const rRaw = await rRes.json();
    const sRaw = await sRes.json();
    const reports  = normaliseReports(rRaw);
    const signals  = normaliseSignals(sRaw);

    const documented   = signals.filter((sig) =>
      reports.some((r) => relevance(sig, r) > 0)
    ).length;
    const undocumented = signals.length - documented;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS risk-documentation status: ${signals.length} active risk signals, ` +
          `${reports.length} reports on file, ${documented} signals have report coverage, ` +
          `${undocumented} signals are entirely undocumented — an intelligence gap. ` +
          `Give a 2-sentence risk-documentation brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Risk documentation analysis complete, sir.").trim();
  } catch {
    return "Risk signal report correlation unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseReports(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.reports)         ? raw.reports
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:      r.id       || String(i),
    title:   r.title    || r.name     || r.heading  || `Report ${i + 1}`,
    content: (r.content || r.body     || r.text     || r.summary || r.description || "").toString().slice(0, 400),
    type:    r.type     || r.category || r.report_type || "",
    tags:    Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
  }));
}

function normaliseSignals(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.signals)         ? raw.signals
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id            || String(i),
    title:       s.title         || s.name        || `Signal ${i + 1}`,
    description: (s.description  || s.details     || s.summary || "").toString().slice(0, 200),
    type:        s.type          || s.signal_type  || s.category || "",
    severity:    (s.severity     || s.level        || "").toUpperCase(),
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || s.tag || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(signal, report) {
  const sw = keywords(`${signal.title} ${signal.description} ${signal.type} ${signal.tags}`);
  const rw = keywords(`${report.title} ${report.content} ${report.type} ${report.tags}`);
  return sw.filter((w) => rw.some((r) => r.includes(w) || w.includes(r))).length;
}

function buildCorrelated(signals, reports) {
  return signals.map((sig) => {
    const matched = reports
      .map((r) => ({ ...r, score: relevance(sig, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sig, reports: matched, documented: matched.length > 0 };
  });
}

const SEVERITY_COLOR = {
  CRITICAL: "#FF4444",
  HIGH:     "#FF8800",
  MEDIUM:   "#F0B429",
  LOW:      "#4ADE80",
};

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "DOCUMENTED", "UNDOCUMENTED"];

export default function ReportRiskCorrelator() {
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
      const [rRes, sRes] = await Promise.all([
        fetch(`${base}/v1/reports`,          { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      const rRaw = await rRes.json();
      const sRaw = await sRes.json();
      setReports(normaliseReports(rRaw));
      setSignals(normaliseSignals(sRaw));
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
    window.addEventListener("jarvis:rprsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rprsk-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isRprskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated   = buildCorrelated(signals, reports);
  const documented   = correlated.filter((s) =>  s.documented).length;
  const undocumented = correlated.filter((s) => !s.documented).length;

  const sq = search.toLowerCase();
  const visible = correlated.filter((sig) => {
    if (filter === "DOCUMENTED"   && !sig.documented) return false;
    if (filter === "UNDOCUMENTED" &&  sig.documented) return false;
    if (sq && !`${sig.title} ${sig.type} ${sig.severity}`.toLowerCase().includes(sq)) return false;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildRprskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Report–Risk Correlator (◈ RPRSK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(255,68,68,0.15)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? "#FF8800" : S.border}`,
          borderRadius: S.radius, color: open ? "#FF8800" : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? "0 0 8px #FF880044" : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ RPRSK{undocumented > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF8800", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{undocumented}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: "2px solid #FF8800",
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: "#FF8800", letterSpacing: 2, fontWeight: 700 }}>
              REPORT–RISK CORRELATOR
            </span>
            <button
              onClick={assess}
              disabled={assessing || signals.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || signals.length === 0) ? 0.4 : 1,
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
              { label: "REPORTS",      val: reports.length,   color: C.blue    },
              { label: "SIGNALS",      val: signals.length,   color: C.neon    },
              { label: "DOCUMENTED",   val: documented,       color: "#4ADE80" },
              { label: "UNDOCUMENTED", val: undocumented,     color: "#FF8800" },
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
                flex: 1, background: filter === t ? "rgba(255,136,0,0.18)" : "transparent",
                border: `1px solid ${filter === t ? "#FF8800" : S.border}`,
                color: filter === t ? "#FF8800" : S.text,
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
              placeholder="Search risk signals…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: S.fs.xxs, padding: "4px 8px",
                outline: "none",
              }}
            />
          </div>

          {/* Signal list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && signals.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No signals match.</div>
            ) : visible.map((sig) => {
              const sevColor = SEVERITY_COLOR[sig.severity] || S.text;
              return (
                <div key={sig.id} style={{ marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(expanded === sig.id ? null : sig.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                      background: "rgba(0,0,0,0.25)",
                      borderLeft: `3px solid ${sig.documented ? "#4ADE80" : "#FF8800"}`,
                    }}
                  >
                    <span style={{ color: sig.documented ? "#4ADE80" : "#FF8800", fontSize: 10, width: 10 }}>
                      {sig.documented ? "●" : "○"}
                    </span>
                    <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sig.title}
                    </span>
                    {sig.severity && (
                      <span style={{
                        fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                        background: `${sevColor}22`, color: sevColor,
                        border: `1px solid ${sevColor}44`,
                        whiteSpace: "nowrap",
                      }}>
                        {sig.severity}
                      </span>
                    )}
                    <span style={{ color: sig.documented ? "#4ADE80" : "#FF8800", fontSize: "9px", minWidth: 46, textAlign: "right" }}>
                      {sig.documented ? `${sig.reports.length} RPT` : "DARK"}
                    </span>
                    <span style={{ color: S.text, fontSize: 9 }}>{expanded === sig.id ? "▴" : "▾"}</span>
                  </div>

                  {expanded === sig.id && (
                    <div style={{
                      margin: "2px 0 2px 18px",
                      background: "rgba(0,0,0,0.18)", borderRadius: 4,
                      padding: "5px 8px",
                    }}>
                      {sig.documented ? sig.reports.map((r) => (
                        <div key={r.id} style={{
                          display: "flex", justifyContent: "space-between",
                          padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                        }}>
                          <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.title}
                          </span>
                          {r.type && (
                            <span style={{
                              fontSize: "8px", padding: "0 4px", borderRadius: 3,
                              background: `${C.blue}22`, color: C.blue,
                              marginLeft: 4, whiteSpace: "nowrap",
                            }}>
                              {r.type}
                            </span>
                          )}
                          <span style={{ color: C.blue, fontSize: "9px", marginLeft: 4, whiteSpace: "nowrap" }}>
                            rel:{r.score}
                          </span>
                        </div>
                      )) : (
                        <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                          No reports reference this risk signal — intelligence gap.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
