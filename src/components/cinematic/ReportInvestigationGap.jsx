/**
 * F66 — Report-Investigation Gap Analyzer
 *
 * Parallel-fetches /v1/reports + /v1/investigations, then keyword-correlates
 * each open investigation against the report catalog to surface whether a case
 * has supporting research documentation (BACKED) or not (DARK).
 *
 * Stat tiles: investigations / reports / backed / dark.
 * Filter tabs: ALL | BACKED | DARK.
 * Expand any investigation to see matched reports with relevance score.
 * ▶ ASSESS: sends a 2-sentence AI research-coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RPINVG  at bottom:8 left:8604, zIndex 66.
 * Voice:   "report investigation gap / research coverage / case reports / rpinvg"
 * Event:   jarvis:rpinvg-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 8604;
const POLL_MS  = 90_000;

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

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

const RPINVG_RE =
  /\b(report\s+invest(?:igation)?(?:\s+gap)?|research\s+coverage|case\s+reports?|investigation\s+report(?:\s+gap)?|rpinvg|report\s+gap|research\s+dark|case\s+research)\b/i;

export function isRpInvgQuery(q) { return RPINVG_RE.test(q); }

export async function buildRpInvgScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [rRes, iRes] = await Promise.all([
      fetch(`${base}/v1/reports`,        { headers: hdr }),
      fetch(`${base}/v1/investigations`, { headers: hdr }),
    ]);
    const rRaw = await rRes.json();
    const iRaw = await iRes.json();
    const reports = normaliseReports(rRaw);
    const investigations = normaliseInvestigations(iRaw);

    const { backed, dark } = correlate(investigations, reports);
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS report-investigation coverage: ${investigations.length} cases, ` +
          `${reports.length} reports, ${backed} research-backed, ${dark} research-dark. ` +
          `Give a 2-sentence research-coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Report-investigation gap analysis complete, sir.").trim();
  } catch {
    return "Report-investigation gap analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseReports(raw) {
  const arr = Array.isArray(raw)        ? raw
    : Array.isArray(raw?.data)          ? raw.data
    : Array.isArray(raw?.reports)       ? raw.reports
    : Array.isArray(raw?.items)         ? raw.items
    : Array.isArray(raw?.results)       ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:      r.id      || String(i),
    title:   r.title   || r.name  || r.report_name || `Report ${i + 1}`,
    summary: (r.summary || r.description || r.abstract || r.content || r.tags || "").toString(),
    date:    r.created_at || r.date || r.published_at || null,
  }));
}

function normaliseInvestigations(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.investigations)     ? raw.investigations
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id:       inv.id       || String(i),
    title:    inv.title    || inv.name  || inv.case_name || `Case ${i + 1}`,
    status:   (inv.status  || "open").toLowerCase(),
    priority: (inv.priority || "").toLowerCase(),
    summary:  (inv.summary || inv.description || inv.notes || inv.tags || "").toString(),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:]+/)
    .filter((w) => w.length >= 3);
}

function relevance(inv, report) {
  const iw = keywords(inv.title + " " + inv.summary);
  const rw = keywords(report.title + " " + report.summary);
  return iw.filter((w) => rw.some((r) => r.includes(w) || w.includes(r))).length;
}

function correlate(investigations, reports) {
  let backed = 0, dark = 0;
  for (const inv of investigations) {
    const matched = reports.some((r) => relevance(inv, r) > 0);
    matched ? backed++ : dark++;
  }
  return { backed, dark };
}

function buildCorrelated(investigations, reports) {
  return investigations.map((inv) => {
    const matched = reports
      .map((r) => ({ ...r, score: relevance(inv, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, reports: matched, backed: matched.length > 0 };
  });
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "BACKED", "DARK"];

const PRIORITY_COLOR = { critical: "#FF4444", high: "#FF8800", medium: "#FFD700", low: "#4ADE80" };

export default function ReportInvestigationGap() {
  const [open,          setOpen]          = useState(false);
  const [reports,       setReports]       = useState([]);
  const [investigations,setInvestigations]= useState([]);
  const [loading,       setLoading]       = useState(false);
  const [filter,        setFilter]        = useState("ALL");
  const [expanded,      setExpanded]      = useState(null);
  const [assessing,     setAssessing]     = useState(false);
  const [lastFetch,     setLastFetch]     = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [rRes, iRes] = await Promise.all([
        fetch(`${base}/v1/reports`,        { headers: hdr }),
        fetch(`${base}/v1/investigations`, { headers: hdr }),
      ]);
      const rRaw = await rRes.json();
      const iRaw = await iRes.json();
      setReports(normaliseReports(rRaw));
      setInvestigations(normaliseInvestigations(iRaw));
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
    window.addEventListener("jarvis:rpinvg-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rpinvg-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isRpInvgQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(investigations, reports);
  const backed = correlated.filter((i) => i.backed).length;
  const dark   = correlated.filter((i) => !i.backed).length;

  const visible = correlated.filter((i) => {
    if (filter === "BACKED") return i.backed;
    if (filter === "DARK")   return !i.backed;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildRpInvgScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Report-Investigation Gap Analyzer (◈ RPINVG)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 66,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ RPINVG{dark > 0 && (
          <span style={{
            marginLeft: 4, background: C.red, color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{dark}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 65,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
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
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              REPORT–INVESTIGATION GAP
            </span>
            <button
              onClick={assess}
              disabled={assessing || investigations.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || investigations.length === 0) ? 0.4 : 1,
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
              { label: "CASES",   val: investigations.length, color: C.neon  },
              { label: "REPORTS", val: reports.length,        color: C.blue  },
              { label: "BACKED",  val: backed,                color: "#4ADE80" },
              { label: "DARK",    val: dark,                  color: C.red   },
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
          <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Investigation list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && investigations.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No cases match.</div>
            ) : visible.map((inv) => (
              <div key={inv.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${inv.backed ? "#4ADE80" : C.red}`,
                  }}
                >
                  <span style={{ color: inv.backed ? "#4ADE80" : C.red, fontSize: 10, width: 10 }}>
                    {inv.backed ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.title}
                  </span>
                  {inv.priority && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${PRIORITY_COLOR[inv.priority] || C.blue}22`,
                      color: PRIORITY_COLOR[inv.priority] || C.blue,
                      border: `1px solid ${PRIORITY_COLOR[inv.priority] || C.blue}44`,
                    }}>
                      {inv.priority.toUpperCase()}
                    </span>
                  )}
                  <span style={{ color: inv.backed ? "#4ADE80" : C.red, fontSize: "9px", minWidth: 40, textAlign: "right" }}>
                    {inv.backed ? `${inv.reports.length} RPT` : "DARK"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === inv.id ? "▴" : "▾"}</span>
                </div>

                {expanded === inv.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {inv.backed ? inv.reports.map((rpt) => (
                      <div key={rpt.id} style={{
                        display: "flex", justifyContent: "space-between",
                        padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {rpt.title}
                        </span>
                        <span style={{ color: C.blue, fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap" }}>
                          rel:{rpt.score}
                          {rpt.date ? ` · ${new Date(rpt.date).getFullYear()}` : ""}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No matching reports found for this case.
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
            /v1/reports · /v1/investigations · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
