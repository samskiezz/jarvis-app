/**
 * F117 — Scenario × Investment Exposure Matrix
 *
 * Parallel-fetches /v1/scenario/list + /entities/Investment, then
 * keyword-correlates each scenario (name/objective/type/description)
 * against every holding (name/type/sector/description/ticker) to
 * surface EXPOSED investments (at least one scenario match) vs SAFE.
 *
 * Stat tiles: scenarios / investments / exposed / safe.
 * Filter tabs: ALL | EXPOSED | SAFE.
 * Expand scenario → matched investments with sector badge + relevance score.
 * Amber badge on exposed-investment count.
 * ▶ ASSESS: 2-sentence portfolio-scenario risk brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SCNINV  at bottom:8 left:34040, zIndex 72.
 * Voice:   "scenario investment / investment scenario / portfolio scenario /
 *           scninv / which investments are in scenarios"
 * Event:   jarvis:scninv-toggle
 * Refresh: 120 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 34040;
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

// ── exported intent helpers ──────────────────────────────────────────────────

const SCNINV_RE =
  /\b(scenario\s+invest(?:ment)?|invest(?:ment)?\s+scenario|portfolio\s+scenario|which\s+invest(?:ment)?s?\s+(are\s+in|match|touch)\s+scenarios?|scninv)\b/i;

export function isScninvQuery(q) { return SCNINV_RE.test(q); }

export async function buildScninvScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [sRes, iRes] = await Promise.all([
      fetch(`${base}/v1/scenario/list`,      { headers: hdr }),
      fetch(`${base}/entities/Investment`,   { headers: hdr }),
    ]);
    const scenarios   = normaliseScenarios(await sRes.json());
    const investments = normaliseInvestments(await iRes.json());

    const exposedCount = investments.filter((inv) =>
      scenarios.some((sc) => relevance(sc, inv) > 0)
    ).length;
    const safeCount = investments.length - exposedCount;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS portfolio-scenario exposure analysis: ${scenarios.length} active scenarios, ` +
          `${investments.length} portfolio holdings reviewed. ${exposedCount} holdings appear ` +
          `in active scenario scope (exposed), ${safeCount} holdings have no scenario overlap ` +
          `(safe). Give a 2-sentence strategic risk-exposure assessment — formal British butler ` +
          `tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Scenario investment exposure analysis complete, sir.").trim();
  } catch {
    return "Scenario investment exposure analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.items)             ? raw.items
    : Array.isArray(raw?.results)           ? raw.results
    : Array.isArray(raw?.scenarios)         ? raw.scenarios
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || String(i),
    name:        s.name        || s.title       || `Scenario ${i + 1}`,
    objective:   (s.objective  || s.description || s.goal || "").toString().slice(0, 300),
    type:        s.type        || s.category    || "",
    status:      s.status      || s.state       || "unknown",
  }));
}

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.investments)        ? raw.investments
    : [];
  return arr.map((inv, i) => ({
    id:          inv.id          || String(i),
    name:        inv.name        || inv.title    || inv.ticker || `Holding ${i + 1}`,
    type:        inv.type        || inv.asset_type || "",
    sector:      inv.sector      || inv.industry  || "",
    description: (inv.description || inv.notes   || "").toString().slice(0, 200),
    ticker:      inv.ticker      || inv.symbol    || "",
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(scenario, investment) {
  const sw = keywords(`${scenario.name} ${scenario.objective} ${scenario.type}`);
  const iw = keywords(
    `${investment.name} ${investment.type} ${investment.sector} ${investment.description} ${investment.ticker}`
  );
  return sw.filter((w) => iw.some((iv) => iv.includes(w) || w.includes(iv))).length;
}

function buildMatrix(scenarios, investments) {
  return scenarios.map((sc) => {
    const matched = investments
      .map((inv) => ({ ...inv, score: relevance(sc, inv) }))
      .filter((inv) => inv.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sc, investments: matched, exposed: matched.length > 0 };
  });
}

function statusColor(st) {
  const u = (st || "").toUpperCase();
  if (u === "RUNNING")   return "#4ADE80";
  if (u === "COMPLETED") return C.blue;
  if (u === "FAILED")    return "#FF3030";
  if (u === "PENDING")   return "#FFD700";
  return S.textMuted;
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "EXPOSED", "SAFE"];

export default function ScenarioInvestmentExposure() {
  const [open,        setOpen]        = useState(false);
  const [scenarios,   setScenarios]   = useState([]);
  const [investments, setInvestments] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [query,       setQuery]       = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [sRes, iRes] = await Promise.all([
        fetch(`${base}/v1/scenario/list`,    { headers: hdr }),
        fetch(`${base}/entities/Investment`, { headers: hdr }),
      ]);
      setScenarios(normaliseScenarios(await sRes.json()));
      setInvestments(normaliseInvestments(await iRes.json()));
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
    window.addEventListener("jarvis:scninv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:scninv-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isScninvQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const matrix    = buildMatrix(scenarios, investments);
  const exposed   = investments.filter((inv) =>
    scenarios.some((sc) => relevance(sc, inv) > 0)
  ).length;
  const safe      = investments.length - exposed;

  const visible = matrix.filter((sc) => {
    if (filter === "EXPOSED") return sc.exposed;
    if (filter === "SAFE")    return !sc.exposed;
    const q = query.toLowerCase();
    return !q || sc.name.toLowerCase().includes(q) || sc.objective.toLowerCase().includes(q);
  });

  async function assess() {
    setAssessing(true);
    const text = await buildScninvScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const AMBER = "#FFB347";

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Scenario × Investment Exposure (◈ SCNINV)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 72,
          background: open ? "rgba(255,179,71,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? AMBER : S.border}`,
          borderRadius: S.radius, color: open ? AMBER : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${AMBER}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ SCNINV{exposed > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{exposed}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 71,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${AMBER}`,
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
            <span style={{ color: AMBER, letterSpacing: 2, fontWeight: 700 }}>
              SCENARIO–INVESTMENT EXPOSURE
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
              { label: "SCENARIOS",    val: scenarios.length,   color: C.blue    },
              { label: "INVESTMENTS",  val: investments.length, color: C.neon    },
              { label: "EXPOSED",      val: exposed,            color: AMBER     },
              { label: "SAFE",         val: safe,               color: "#4ADE80" },
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
          <div style={{
            display: "flex", gap: 4, padding: "0 12px 8px",
            borderBottom: `1px solid ${S.border}`,
          }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                background: filter === t ? `${AMBER}22` : "transparent",
                border: `1px solid ${filter === t ? AMBER : S.border}`,
                color: filter === t ? AMBER : S.textMuted,
                borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search (ALL tab only) */}
          {filter === "ALL" && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search scenarios…"
              style={{
                margin: "6px 12px 2px",
                background: "rgba(0,0,0,0.4)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: S.fs.xxs,
                padding: "4px 8px", outline: "none",
              }}
            />
          )}

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 12px 10px" }}>
            {loading && scenarios.length === 0 && (
              <div style={{ color: S.textMuted, padding: "12px 0" }}>◌ loading…</div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: S.textMuted, padding: "12px 0" }}>no scenarios in this filter</div>
            )}
            {visible.map((sc) => (
              <div key={sc.id} style={{
                borderBottom: `1px solid ${S.border}`, paddingBottom: 6, marginBottom: 6,
              }}>
                <div
                  style={{
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                    gap: 6, cursor: "pointer",
                  }}
                  onClick={() => setExpanded(expanded === sc.id ? null : sc.id)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 5, marginBottom: 2,
                    }}>
                      <span style={{
                        color: sc.exposed ? AMBER : "#4ADE80",
                        fontWeight: 600, fontSize: "9px",
                      }}>
                        {sc.exposed ? "● EXPOSED" : "○ SAFE"}
                      </span>
                      <span style={{
                        color: statusColor(sc.status),
                        fontSize: "8px", letterSpacing: 1, fontWeight: 700,
                      }}>
                        {sc.status.toUpperCase()}
                      </span>
                      <span style={{ color: S.textHi, fontWeight: 500, fontSize: S.fs.xxs }}>
                        {sc.name.slice(0, 30)}{sc.name.length > 30 ? "…" : ""}
                      </span>
                    </div>
                    {sc.objective && (
                      <div style={{ color: S.textMuted, fontSize: "9px" }}>
                        {sc.objective.slice(0, 72)}{sc.objective.length > 72 ? "…" : ""}
                      </div>
                    )}
                  </div>
                  <span style={{ color: S.textMuted, fontSize: "9px", flexShrink: 0 }}>
                    {sc.investments.length > 0
                      ? `${sc.investments.length} inv`
                      : "—"}
                  </span>
                </div>

                {expanded === sc.id && sc.investments.length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 8 }}>
                    {sc.investments.slice(0, 5).map((inv) => (
                      <div key={inv.id} style={{
                        padding: "4px 0", borderTop: `1px solid ${S.border}`,
                      }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                          <div>
                            <span style={{ color: C.blue, fontSize: "9px" }}>
                              {inv.name.slice(0, 24)}{inv.name.length > 24 ? "…" : ""}
                            </span>
                            {inv.sector && (
                              <span style={{
                                marginLeft: 4,
                                color: S.textMuted, fontSize: "8px",
                                background: "rgba(255,255,255,0.06)",
                                borderRadius: 3, padding: "0 3px",
                              }}>
                                {inv.sector.slice(0, 14)}
                              </span>
                            )}
                          </div>
                          <span style={{
                            color: S.textMuted, fontSize: "9px",
                            background: `${AMBER}22`,
                            borderRadius: 4, padding: "0 4px", flexShrink: 0,
                          }}>
                            {inv.score}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {expanded === sc.id && sc.investments.length === 0 && (
                  <div style={{
                    marginTop: 6, paddingLeft: 8,
                    color: "#4ADE80", fontSize: "9px",
                  }}>
                    ✓ no portfolio holdings match this scenario
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
