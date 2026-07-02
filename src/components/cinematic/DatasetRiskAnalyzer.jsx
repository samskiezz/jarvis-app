/**
 * F95 — Dataset × Risk Signal Intelligence Gap Analyzer
 *
 * Parallel-fetches /v1/datasets + /entities/RiskSignal, then keyword-correlates
 * each risk signal (title / description / type / tags) against the dataset
 * catalog to surface which risks are DATA-BACKED (at least one dataset provides
 * empirical evidence) vs DATA-DARK (no dataset coverage — speculative gap).
 *
 * Stat tiles: signals / datasets / backed / dark.
 * Filter tabs: ALL | DATA-BACKED | DATA-DARK.
 * Expand any signal → matched datasets with relevance score + type badge.
 * Amber badge on data-dark CRITICAL/HIGH signal count.
 * ▶ ASSESS: 2-sentence AI evidence-gap brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ DSRSK  at bottom:8 left:26160, zIndex 70.
 * Voice:   "dataset risk / data-backed risks / risk evidence /
 *           which risks have data / risk data gap / dsrsk"
 * Event:   jarvis:dsrsk-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 26160;
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

const DSRSK_RE =
  /\b(dataset\s+risk|data[\s-]backed\s+risks?|risk\s+(evidence|data)|which\s+risks?\s+(have|has)\s+data|risk\s+data\s+gap|evidence\s+gap|dsrsk)\b/i;

export function isDsrskQuery(q) { return DSRSK_RE.test(q); }

export async function buildDsrskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [dsRes, rsRes] = await Promise.all([
      fetch(`${base}/v1/datasets`,          { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
    ]);
    const dsRaw = await dsRes.json();
    const rsRaw = await rsRes.json();
    const datasets = normaliseDatasets(dsRaw);
    const signals  = normaliseSignals(rsRaw);

    const backed = signals.filter((s) =>
      datasets.some((d) => relevance(s, d) > 0)
    ).length;
    const dark = signals.length - backed;
    const critDark = signals.filter(
      (s) => !datasets.some((d) => relevance(s, d) > 0) &&
             ["critical", "high"].includes((s.severity || "").toLowerCase())
    ).length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS dataset-risk intelligence gap analysis: ${signals.length} active risk signals, ` +
          `${datasets.length} datasets in catalog, ${backed} signals are data-backed by at least ` +
          `one empirical dataset, ${dark} signals have zero dataset coverage (speculative), ` +
          `${critDark} of those dark signals are CRITICAL or HIGH severity. ` +
          `Give a 2-sentence risk-evidence intelligence brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Dataset-risk intelligence gap analysis complete, sir.").trim();
  } catch {
    return "Risk evidence analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.datasets)         ? raw.datasets
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr.map((d, i) => ({
    id:          d.id           || String(i),
    name:        d.name         || d.title       || `Dataset ${i + 1}`,
    description: (d.description || d.summary     || d.about || "").toString().slice(0, 250),
    type:        d.type         || d.category    || d.format || "",
    rowCount:    d.row_count    || d.rows        || d.count  || null,
  }));
}

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function normaliseSignals(raw) {
  const arr = Array.isArray(raw)                 ? raw
    : Array.isArray(raw?.data)                   ? raw.data
    : Array.isArray(raw?.risk_signals)           ? raw.risk_signals
    : Array.isArray(raw?.signals)                ? raw.signals
    : Array.isArray(raw?.items)                  ? raw.items
    : Array.isArray(raw?.results)                ? raw.results
    : [];
  return arr
    .map((s, i) => ({
      id:          s.id           || String(i),
      title:       s.title        || s.name          || s.signal_name || `Signal ${i + 1}`,
      description: (s.description || s.summary       || s.body        || "").toString().slice(0, 250),
      severity:    (s.severity    || s.level         || s.risk_level  || "low").toLowerCase(),
      type:        s.type         || s.category      || s.signal_type || "",
      tags:        Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
    }))
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(signal, dataset) {
  const sw = keywords(`${signal.title} ${signal.description} ${signal.type} ${signal.tags}`);
  const dw = keywords(`${dataset.name} ${dataset.description} ${dataset.type}`);
  return sw.filter((w) => dw.some((d) => d.includes(w) || w.includes(d))).length;
}

function buildCorrelated(signals, datasets) {
  return signals.map((s) => {
    const matched = datasets
      .map((d) => ({ ...d, score: relevance(s, d) }))
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...s, datasets: matched, backed: matched.length > 0 };
  });
}

function sevColor(sev) {
  if (sev === "critical") return "#FF3333";
  if (sev === "high")     return "#FF8800";
  if (sev === "medium")   return "#FFD700";
  return "#6B7280";
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "DATA-BACKED", "DATA-DARK"];

export default function DatasetRiskAnalyzer() {
  const [open,      setOpen]      = useState(false);
  const [datasets,  setDatasets]  = useState([]);
  const [signals,   setSignals]   = useState([]);
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
      const [dsRes, rsRes] = await Promise.all([
        fetch(`${base}/v1/datasets`,         { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      const dsRaw = await dsRes.json();
      const rsRaw = await rsRes.json();
      setDatasets(normaliseDatasets(dsRaw));
      setSignals(normaliseSignals(rsRaw));
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
    window.addEventListener("jarvis:dsrsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dsrsk-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isDsrskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(signals, datasets);
  const backed     = correlated.filter((s) => s.backed).length;
  const dark       = correlated.filter((s) => !s.backed).length;
  const critDark   = correlated.filter(
    (s) => !s.backed && ["critical", "high"].includes(s.severity)
  ).length;

  const visible = correlated.filter((s) => {
    if (filter === "DATA-BACKED") return s.backed;
    if (filter === "DATA-DARK")   return !s.backed;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildDsrskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Dataset–Risk Analyzer (◈ DSRSK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 70,
          background: open ? "rgba(251,191,36,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? "#FBBF24" : S.border}`,
          borderRadius: S.radius, color: open ? "#FBBF24" : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? "0 0 8px #FBBF2444" : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ DSRSK{critDark > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF8800", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{critDark}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 69,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: "2px solid #FBBF24",
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
            <span style={{ color: "#FBBF24", letterSpacing: 2, fontWeight: 700 }}>
              DATASET–RISK ANALYZER
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
              { label: "SIGNALS",  val: signals.length,  color: C.neon    },
              { label: "DATASETS", val: datasets.length, color: C.blue    },
              { label: "BACKED",   val: backed,           color: "#4ADE80" },
              { label: "DARK",     val: dark,             color: "#FBBF24" },
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
              <button key={t} onClick={() => { setFilter(t); setExpanded(null); }} style={{
                flex: 1, background: filter === t ? "#FBBF2422" : "transparent",
                border: `1px solid ${filter === t ? "#FBBF24" : S.border}`,
                color: filter === t ? "#FBBF24" : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Signal list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && signals.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No signals match.</div>
            ) : visible.map((s) => (
              <div key={s.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${s.backed ? "#4ADE80" : "#FBBF24"}`,
                  }}
                >
                  <span style={{
                    fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                    background: `${sevColor(s.severity)}22`, color: sevColor(s.severity),
                    border: `1px solid ${sevColor(s.severity)}55`,
                    whiteSpace: "nowrap", textTransform: "uppercase", flexShrink: 0,
                  }}>
                    {s.severity || "LOW"}
                  </span>
                  <span style={{
                    flex: 1, color: S.textHi,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {s.title}
                  </span>
                  <span style={{
                    color: s.backed ? "#4ADE80" : "#FBBF24",
                    fontSize: "9px", minWidth: 48, textAlign: "right", whiteSpace: "nowrap",
                  }}>
                    {s.backed ? `${s.datasets.length} DS` : "DARK"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>
                    {expanded === s.id ? "▴" : "▾"}
                  </span>
                </div>

                {expanded === s.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {s.backed ? s.datasets.map((d) => (
                      <div key={d.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        {d.type && (
                          <span style={{
                            fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                            background: `${C.blue}22`, color: C.blue,
                            border: `1px solid ${C.blue}44`,
                            whiteSpace: "nowrap", textTransform: "uppercase", flexShrink: 0,
                          }}>
                            {String(d.type).slice(0, 8)}
                          </span>
                        )}
                        <span style={{
                          color: S.textHi, fontSize: "9px", flex: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {d.name}
                        </span>
                        {d.rowCount !== null && (
                          <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                            {Number(d.rowCount).toLocaleString()} rows
                          </span>
                        )}
                        <span style={{ color: C.blue, fontSize: "9px", marginLeft: 2, whiteSpace: "nowrap" }}>
                          rel:{d.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: "#FBBF24", fontSize: "9px", padding: "2px 0" }}>
                        No datasets found for this risk signal — intelligence gap.
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
            /v1/datasets · /entities/RiskSignal · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
