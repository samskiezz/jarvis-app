/**
 * F69 — Report-Scenario Mapper
 *
 * Parallel-fetches /v1/reports + /v1/scenario/list, then keyword-correlates
 * each scenario against the report catalog to surface whether a playbook has
 * RESEARCH BACKING (at least one report references it) or is REPORT-DARK
 * (no matching research found).
 *
 * Stat tiles: reports / scenarios / backed / dark.
 * Filter tabs: ALL | BACKED | DARK.
 * Expand any scenario → matched reports with relevance score + year.
 * ▶ ASSESS: sends a 2-sentence AI research-readiness brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RSCMAP  at bottom:8 left:9020, zIndex 68.
 * Voice:   "report scenario / scenario reports / research backed / rscmap"
 * Event:   jarvis:rscmap-toggle
 * Refresh: 120 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 9020;
const POLL_MS  = 120_000;

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

// ── exported intent helpers ───────────────────────────────────────────────────

const RSCMAP_RE =
  /\b(report\s+scenario|scenario\s+report|research[\s-]backed\s+scenario|rscmap|scenario\s+research|playbook\s+report)\b/i;

export function isRscmapQuery(q) { return RSCMAP_RE.test(q); }

export async function buildRscmapScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [rpRes, scRes] = await Promise.all([
      fetch(`${base}/v1/reports`,       { headers: hdr }),
      fetch(`${base}/v1/scenario/list`, { headers: hdr }),
    ]);
    const rpRaw = await rpRes.json();
    const scRaw = await scRes.json();
    const reports   = normaliseReports(rpRaw);
    const scenarios = normaliseScenarios(scRaw);

    const backed = scenarios.filter((sc) => reports.some((rp) => relevance(sc, rp) > 0)).length;
    const dark   = scenarios.length - backed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS report-scenario coverage: ${reports.length} reports, ` +
          `${scenarios.length} scenarios, ${backed} research-backed, ${dark} report-dark. ` +
          `Give a 2-sentence research-readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Report-scenario analysis complete, sir.").trim();
  } catch {
    return "Report-scenario analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseReports(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.reports)         ? raw.reports
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr.map((rp, i) => ({
    id:    rp.id    || String(i),
    title: rp.title || rp.name || rp.report_name || `Report ${i + 1}`,
    desc:  (rp.description || rp.summary || rp.abstract || rp.tags || "").toString(),
    year:  rp.year  || rp.date?.slice(0, 4) || "",
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.scenarios)        ? raw.scenarios
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr.map((sc, i) => ({
    id:     sc.id      || String(i),
    title:  sc.title   || sc.name   || sc.scenario_name  || `Scenario ${i + 1}`,
    desc:   (sc.description || sc.summary || sc.tags || "").toString(),
    status: (sc.status || "").toLowerCase(),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@]+/)
    .filter((w) => w.length >= 3);
}

function relevance(scenario, report) {
  const sw = keywords(`${scenario.title} ${scenario.desc}`);
  const rw = keywords(`${report.title} ${report.desc}`);
  return sw.filter((w) => rw.some((r) => r.includes(w) || w.includes(r))).length;
}

function buildCorrelated(scenarios, reports) {
  return scenarios.map((sc) => {
    const matched = reports
      .map((rp) => ({ ...rp, score: relevance(sc, rp) }))
      .filter((rp) => rp.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sc, reports: matched, backed: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "BACKED", "DARK"];

export default function ReportScenarioMapper() {
  const [open,      setOpen]      = useState(false);
  const [reports,   setReports]   = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [rpRes, scRes] = await Promise.all([
        fetch(`${base}/v1/reports`,       { headers: hdr }),
        fetch(`${base}/v1/scenario/list`, { headers: hdr }),
      ]);
      setReports(normaliseReports(await rpRes.json()));
      setScenarios(normaliseScenarios(await scRes.json()));
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
    window.addEventListener("jarvis:rscmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rscmap-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isRscmapQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(scenarios, reports);
  const backed     = correlated.filter((sc) => sc.backed).length;
  const dark       = correlated.filter((sc) => !sc.backed).length;

  const visible = correlated.filter((sc) => {
    if (filter === "BACKED") return sc.backed;
    if (filter === "DARK")   return !sc.backed;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildRscmapScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Report-Scenario Mapper (◈ RSCMAP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 68,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ RSCMAP{dark > 0 && (
          <span style={{
            marginLeft: 4, background: "#F59E0B", color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{dark}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 67,
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
              REPORT–SCENARIO MAPPER
            </span>
            <button
              onClick={assess}
              disabled={assessing || scenarios.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || scenarios.length === 0) ? 0.4 : 1,
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
              { label: "REPORTS",   val: reports.length,   color: C.blue    },
              { label: "SCENARIOS", val: scenarios.length,  color: C.neon    },
              { label: "BACKED",    val: backed,            color: "#4ADE80" },
              { label: "DARK",      val: dark,              color: "#F59E0B" },
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

          {/* Scenario list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && scenarios.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No scenarios match.</div>
            ) : visible.map((sc) => (
              <div key={sc.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === sc.id ? null : sc.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${sc.backed ? "#4ADE80" : "#F59E0B"}`,
                  }}
                >
                  <span style={{ color: sc.backed ? "#4ADE80" : "#F59E0B", fontSize: 10, width: 10 }}>
                    {sc.backed ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sc.title}
                  </span>
                  {sc.status && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${C.blue}22`, color: C.blue,
                      border: `1px solid ${C.blue}44`,
                    }}>
                      {sc.status}
                    </span>
                  )}
                  <span style={{ color: sc.backed ? "#4ADE80" : "#F59E0B", fontSize: "9px", minWidth: 46, textAlign: "right" }}>
                    {sc.backed ? `${sc.reports.length} RPT` : "DARK"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === sc.id ? "▴" : "▾"}</span>
                </div>

                {expanded === sc.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {sc.backed ? sc.reports.map((rp) => (
                      <div key={rp.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {rp.title}
                        </span>
                        <span style={{ fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap", color: S.text }}>
                          rel:{rp.score}{rp.year ? ` · ${rp.year}` : ""}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No matching reports found for this scenario.
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
            /v1/reports · /v1/scenario/list · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
